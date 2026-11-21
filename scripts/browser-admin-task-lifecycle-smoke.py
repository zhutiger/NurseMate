"""Validate the simplified task lifecycle in the deployed admin web UI."""

import json
import os
import subprocess
import tempfile
import time
from pathlib import Path
from urllib.request import urlopen

import websocket


base = os.environ.get('ADMIN_URL', 'http://127.0.0.1:8101/admin/').rstrip('/') + '/'
employee_no = os.environ.get('SEED_HEAD_EMPLOYEE_NO', 'admin')
password = os.environ.get('SEED_HEAD_PASSWORD')
nurse_password = os.environ.get('SEED_NURSE_PASSWORD')
if not password or not nurse_password:
    raise SystemExit('缺少测试账号环境变量')


with tempfile.TemporaryDirectory(prefix='nursemate-task-lifecycle-', ignore_cleanup_errors=True) as profile:
    chrome = subprocess.Popen([
        'google-chrome', '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
        '--remote-debugging-port=0', '--remote-allow-origins=*', f'--user-data-dir={profile}', base,
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        active_port = Path(profile, 'DevToolsActivePort')
        for _ in range(100):
            if active_port.exists():
                break
            time.sleep(0.1)
        else:
            raise RuntimeError('Chrome 调试端口未启动')
        port = int(active_port.read_text().splitlines()[0])
        page = next(item for item in json.load(urlopen(f'http://127.0.0.1:{port}/json/list'))
                    if item['type'] == 'page' and item['url'].startswith(base))
        ws = websocket.create_connection(page['webSocketDebuggerUrl'], timeout=60)
        next_id = 0
        errors = []

        def command(method, params=None):
            global next_id
            next_id += 1
            command_id = next_id
            ws.send(json.dumps({'id': command_id, 'method': method, 'params': params or {}}))
            while True:
                message = json.loads(ws.recv())
                if message.get('method') == 'Runtime.exceptionThrown':
                    errors.append(message['params']['exceptionDetails'].get('text', '脚本异常'))
                if message.get('id') == command_id:
                    if 'error' in message:
                        raise RuntimeError(message['error'])
                    return message.get('result', {})

        def evaluate(expression, await_promise=False):
            result = command('Runtime.evaluate', {
                'expression': expression, 'returnByValue': True, 'awaitPromise': await_promise,
            })
            if result.get('exceptionDetails'):
                raise RuntimeError(result['exceptionDetails'].get('text', '页面脚本异常'))
            return result.get('result', {}).get('value')

        def wait_for(expression, description, attempts=250):
            for _ in range(attempts):
                value = evaluate(expression)
                if value:
                    return value
                time.sleep(0.1)
            raise RuntimeError(f'{description}超时；正文={evaluate("document.body?.innerText.slice(0,600)")}；异常={errors[-3:]}')

        command('Runtime.enable')
        command('Page.enable')
        wait_for("document.querySelector('.login-card') !== null", '登录页')
        fill = """(() => {
          const inputs=document.querySelectorAll('.login-card input');
          for(const [input,value] of [[inputs[0],EMPLOYEE],[inputs[1],PASSWORD]]){
            Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);
            input.dispatchEvent(new Event('input',{bubbles:true}));
          }
          document.querySelector('.login-card button').click(); return true;
        })()""".replace('EMPLOYEE', json.dumps(employee_no)).replace('PASSWORD', json.dumps(password))
        evaluate(fill)
        wait_for("!!sessionStorage.getItem('hzy_admin_access_token')", '管理端登录')

        stamp = str(int(time.time()))
        title = f'两状态浏览器验收-{stamp}'
        setup = """(async()=>{
          const token=sessionStorage.getItem('hzy_admin_access_token');
          const call=async(path,method='GET',body)=>{
            const response=await fetch('/api/v1'+path,{method,headers:{'content-type':'application/json','authorization':'Bearer '+token,'idempotency-key':crypto.randomUUID()},body:body?JSON.stringify(body):undefined});
            const payload=await response.json().catch(()=>({})); if(!response.ok) throw new Error(path+':'+response.status); return payload.data??payload;
          };
          const nurseLogin=await fetch('/api/v1/auth/login',{method:'POST',headers:{'content-type':'application/json','idempotency-key':crypto.randomUUID()},body:JSON.stringify({employeeNo:'smoke-nurse',password:NURSE_PASSWORD,clientPlatform:'H5',deviceName:'admin-ui-lifecycle'})});
          const nurse=(await nurseLogin.json()).data;
          const task=await call('/tasks','POST',{title:TITLE,content:'浏览器验证任务查看与生命周期。',level:'IMPORTANT',completionMode:'SIMPLE',feedbackRequired:false,attachmentRequired:false,deadlineAt:new Date(Date.now()+86400000).toISOString(),assigneeSelection:{mode:'USERS',userIds:[nurse.user.id]}});
          await call('/tasks/'+task.id+'/publish','POST',{});
          await fetch('/api/v1/me/tasks/'+task.id,{headers:{'authorization':'Bearer '+nurse.accessToken}});
          return task;
        })()""".replace('NURSE_PASSWORD', json.dumps(nurse_password)).replace('TITLE', json.dumps(title, ensure_ascii=False))
        task = evaluate(setup, await_promise=True)

        evaluate("[...document.querySelectorAll('.sidebar nav button')].find(b=>b.textContent.includes('任务管理')).click()")
        wait_for("document.body?.innerText.includes('任务只分为进行中和已结束')", '任务管理页')
        options = evaluate("[...document.querySelector('.toolbar select').options].map(x=>x.textContent)")
        if options != ['全部任务', '进行中', '已结束']:
            raise RuntimeError(f'任务筛选项不正确：{options}')
        evaluate("[...document.querySelectorAll('.toolbar button')].find(b=>b.textContent.includes('刷新')).click()")
        wait_for(f"document.body?.innerText.includes({json.dumps(title, ensure_ascii=False)})", '新任务行')

        row = evaluate("""(()=>{const row=[...document.querySelectorAll('.task-list tbody tr')].find(r=>r.textContent.includes(TITLE));return row?[...row.children].map(x=>x.textContent.trim()):null})()""".replace('TITLE', json.dumps(title, ensure_ascii=False)))
        if row[3] != '进行中' or row[6] != '1' or row[7] != '0' or not row[10].startswith('剩余 '):
            raise RuntimeError(f'任务列表生命周期或查看统计不正确：{row}')

        evaluate("""(()=>[...document.querySelectorAll('.task-list tbody tr')].find(r=>r.textContent.includes(TITLE)).querySelector('button').click())()""".replace('TITLE', json.dumps(title, ensure_ascii=False)))
        wait_for("!!document.querySelector('.task-detail .progress-cards')", '任务详情')
        cards = evaluate("[...document.querySelectorAll('.task-detail .progress-cards strong')].map(x=>Number(x.textContent))")
        if cards != [1, 0, 1, 0, 1, 0]:
            raise RuntimeError(f'任务详情看板不正确：{cards}')
        if '已查看' not in evaluate("document.querySelector('.task-detail tbody tr').innerText"):
            raise RuntimeError('人员明细未显示查看状态')

        evaluate("window.confirm=()=>true")
        evaluate("[...document.querySelectorAll('.detail-actions button')].find(b=>b.textContent.includes('编辑任务')).click()")
        wait_for("document.body?.innerText.includes('编辑进行中任务')", '编辑弹窗')
        evaluate("""(()=>{const textarea=document.querySelector('.modal textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(textarea,'浏览器更新后的重要内容。');textarea.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('.modal form');[...document.querySelectorAll('.modal button')].find(b=>b.textContent.includes('保存修改')).click()})()""")
        wait_for("!document.body?.innerText.includes('编辑进行中任务')", '保存编辑')
        wait_for("""(()=>{const row=[...document.querySelectorAll('.task-list tbody tr')].find(r=>r.textContent.includes(TITLE));return row&&row.children[6].textContent.trim()==='0'&&row.children[7].textContent.trim()==='1'})()""".replace('TITLE', json.dumps(title, ensure_ascii=False)), '新版本查看重置')

        evaluate("""(()=>[...document.querySelectorAll('.task-list tbody tr')].find(r=>r.textContent.includes(TITLE)).querySelector('button').click())()""".replace('TITLE', json.dumps(title, ensure_ascii=False)))
        wait_for("!!document.querySelector('.task-detail')", '重新打开详情')
        evaluate("[...document.querySelectorAll('.detail-actions button')].find(b=>b.textContent.includes('提前结束')).click()")
        wait_for("!document.querySelector('.task-detail')", '提前结束')
        wait_for("""(()=>[...document.querySelectorAll('.task-list tbody tr')].find(r=>r.textContent.includes(TITLE))?.children[3].textContent.trim()==='已结束')()""".replace('TITLE', json.dumps(title, ensure_ascii=False)), '已结束状态')

        evaluate("""(()=>[...document.querySelectorAll('.task-list tbody tr')].find(r=>r.textContent.includes(TITLE)).querySelector('button').click())()""".replace('TITLE', json.dumps(title, ensure_ascii=False)))
        wait_for("document.body?.innerText.includes('删除任务')", '结束后操作')
        evaluate("[...document.querySelectorAll('.detail-actions button')].find(b=>b.textContent.includes('删除任务')).click()")
        wait_for(f"!document.body?.innerText.includes({json.dumps(title, ensure_ascii=False)})", '业务删除后隐藏')

        audit = evaluate("""(async()=>{const response=await fetch('/api/v1/audit-logs?targetType=task&pageSize=100',{headers:{authorization:'Bearer '+sessionStorage.getItem('hzy_admin_access_token')}});return (await response.json()).data.items.filter(x=>x.targetId===TASK_ID).map(x=>x.action)})()""".replace('TASK_ID', json.dumps(task['id'])), await_promise=True)
        for action in ['task.active_update', 'task.close', 'task.delete']:
            if action not in audit:
                raise RuntimeError(f'缺少审计动作 {action}：{audit}')

        print(json.dumps({'browser': 'admin-task-lifecycle-ok', 'filters': options, 'initialRow': row,
                          'cards': cards, 'versionViewReset': True, 'ended': True,
                          'softDeleteHidden': True, 'audit': audit}, ensure_ascii=False))
    finally:
        chrome.terminate()
        try:
            chrome.wait(timeout=5)
        except subprocess.TimeoutExpired:
            chrome.kill()
