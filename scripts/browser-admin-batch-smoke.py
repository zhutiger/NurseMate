"""Run the admin batch UI smoke on the cloud test server with Chrome and websocket-client."""

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
if not password:
    raise SystemExit('缺少 SEED_HEAD_PASSWORD')


with tempfile.TemporaryDirectory(prefix='nursemate-admin-') as profile:
    chrome = subprocess.Popen([
        'google-chrome', '--headless=new', '--no-sandbox', '--disable-gpu',
        '--disable-dev-shm-usage', '--remote-debugging-port=0',
        '--remote-allow-origins=*', f'--user-data-dir={profile}', base,
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
        pages = json.load(urlopen(f'http://127.0.0.1:{port}/json/list'))
        page = next(item for item in pages if item['type'] == 'page' and item['url'].startswith(base))
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
                    result = message.get('result', {})
                    if result.get('exceptionDetails'):
                        raise RuntimeError(result['exceptionDetails'].get('text', '脚本异常'))
                    return result

        def evaluate(expression, await_promise=False):
            result = command('Runtime.evaluate', {
                'expression': expression, 'returnByValue': True, 'awaitPromise': await_promise,
            })
            return result.get('result', {}).get('value')

        def wait_for(expression, description, attempts=400):
            for _ in range(attempts):
                value = evaluate(expression)
                if value:
                    return value
                time.sleep(0.1)
            raise RuntimeError(f'{description}超时；地址={evaluate("location.href")}；页面={evaluate("document.body?.innerText.slice(0, 500)")}；异常={errors[-3:]}')

        command('Runtime.enable')
        command('Page.enable')
        wait_for("document.body?.innerText.includes('管理端登录')", '登录页')
        fill = """(() => {
          const fields = document.querySelectorAll('.login-card input');
          if (fields.length < 2) return false;
          for (const [field, value] of [[fields[0], EMPLOYEE], [fields[1], PASSWORD]]) {
            Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(field, value);
            field.dispatchEvent(new Event('input', { bubbles: true }));
          }
          document.querySelector('.login-card button').click();
          return true;
        })()""".replace('EMPLOYEE', json.dumps(employee_no)).replace('PASSWORD', json.dumps(password))
        if not evaluate(fill):
            raise RuntimeError('登录表单未找到')
        wait_for("document.body?.innerText.includes('管理看板') && !!sessionStorage.getItem('hzy_admin_access_token')", '管理端登录')

        stamp = str(int(time.time()))
        deadline = '2027-12-31T12:00:00.000Z'

        def request(path, method='GET', body=None):
            options = {
                'method': method,
                'headers': {
                    'content-type': 'application/json',
                    'authorization': 'Bearer ' + 'TOKEN_PLACEHOLDER',
                    'idempotency-key': 'ID_PLACEHOLDER',
                },
            }
            if body is not None:
                options['body'] = json.dumps(body, ensure_ascii=False)
            expression = """(async () => {
              const options = OPTIONS;
              options.headers.authorization = 'Bearer ' + sessionStorage.getItem('hzy_admin_access_token');
              options.headers['idempotency-key'] = crypto.randomUUID();
              const response = await fetch('/api/v1' + PATH, options);
              const payload = await response.json().catch(() => ({}));
              return {status:response.status, data:payload.data ?? payload};
            })()""".replace('OPTIONS', json.dumps(options, ensure_ascii=False)).replace('PATH', json.dumps(path))
            result = evaluate(expression, await_promise=True)
            if not 200 <= result['status'] < 300:
                raise RuntimeError(f'{method} {path} 失败：{result}')
            return result['data']

        tasks = []
        for name, level, publish in [
            ('关闭一', 'IMPORTANT', True), ('关闭二', 'URGENT', True),
            ('取消一', 'NORMAL', False), ('取消二', 'IMPORTANT', False),
        ]:
            created = request('/tasks', 'POST', {
                'title': f'批量验收{stamp}-{name}', 'content': '仅供云端批量操作验收',
                'level': level, 'completionMode': 'SIMPLE', 'feedbackRequired': False,
                'attachmentRequired': False, 'deadlineAt': deadline,
                'assigneeSelection': {'mode': 'ALL_ACTIVE'},
            })
            if publish:
                request(f"/tasks/{created['id']}/publish", 'POST', {})
            tasks.append(created)

        nurse_password = os.environ.get('SEED_NURSE_PASSWORD')
        if not nurse_password:
            raise RuntimeError('缺少 SEED_NURSE_PASSWORD，无法验证越权请求')
        permission_probe = """(async () => {
          const login = await fetch('/api/v1/auth/login', {method:'POST',
            headers:{'content-type':'application/json','idempotency-key':crypto.randomUUID()},
            body:JSON.stringify({employeeNo:'smoke-nurse',password:PASSWORD,clientPlatform:'H5',deviceName:'batch-permission-smoke'})});
          if (!login.ok) return {login:login.status};
          const token = (await login.json()).data.accessToken;
          const options = (method) => ({method, headers:{'content-type':'application/json',
            'authorization':'Bearer '+token,'idempotency-key':crypto.randomUUID()},
            ...(method === 'POST' ? {body:'{}'} : {})});
          const close = await fetch('/api/v1/tasks/' + CLOSE_ID + '/close', options('POST'));
          const cancel = await fetch('/api/v1/tasks/' + CANCEL_ID, options('DELETE'));
          return {close:close.status,cancel:cancel.status};
        })()""".replace('PASSWORD', json.dumps(nurse_password)).replace('CLOSE_ID', json.dumps(tasks[0]['id'])).replace('CANCEL_ID', json.dumps(tasks[2]['id']))
        denied = evaluate(permission_probe, await_promise=True)
        if denied != {'close': 403, 'cancel': 403}:
            raise RuntimeError(f'普通护士越权请求未被拒绝：{denied}')

        evaluate("[...document.querySelectorAll('.sidebar nav button')].find(b => b.textContent.includes('任务管理')).click()")
        wait_for("document.body?.innerText.includes('批量关闭')", '任务列表')
        evaluate("[...document.querySelectorAll('.toolbar button')].find(b => b.textContent.includes('刷新')).click()")
        wait_for(f"document.body?.innerText.includes({json.dumps(tasks[0]['title'])})", '新任务列表')
        evaluate('window.confirm = () => true')

        def select(names):
            expression = """(() => {
              const names = NAMES;
              for (const name of names) {
                const row = [...document.querySelectorAll('.data-table tbody tr')].find(r => r.textContent.includes(name));
                if (!row) return '未找到：' + name;
                const box = row.querySelector('input[type="checkbox"]');
                if (!box.checked) box.click();
              }
              return 'ok';
            })()""".replace('NAMES', json.dumps(names, ensure_ascii=False))
            result = evaluate(expression)
            if result != 'ok':
                raise RuntimeError(result)

        select([tasks[0]['title'], tasks[1]['title'], tasks[2]['title']])
        evaluate("[...document.querySelectorAll('.batch-toolbar button')].find(b => b.textContent.includes('批量关闭')).click()")
        wait_for("document.querySelector('.batch-result')?.textContent.includes('已关闭 2 项；跳过 1 项；失败 0 项')", '批量关闭')

        select([tasks[3]['title'], tasks[0]['title']])
        evaluate("[...document.querySelectorAll('.batch-toolbar button')].find(b => b.textContent.includes('批量取消')).click()")
        wait_for("document.querySelector('.batch-result')?.textContent.includes('已取消 2 项；跳过 1 项；失败 0 项')", '批量取消')

        expected = ['CLOSED', 'CLOSED', 'CANCELLED', 'CANCELLED']
        for item, state in zip(tasks, expected):
            actual = request(f"/tasks/{item['id']}")['status']
            if actual != state:
                raise RuntimeError(f"{item['title']} 状态为 {actual}，预期 {state}")
        audit = request('/audit-logs?targetType=task&pageSize=100')['items']
        for item, action in zip(tasks, ['task.close', 'task.close', 'task.cancel', 'task.cancel']):
            if not any(row['targetId'] == item['id'] and row['action'] == action for row in audit):
                raise RuntimeError(f"{item['title']} 缺少 {action} 审计")
        tones = evaluate("""(() => {
          const rows = [...document.querySelectorAll('.data-table tbody tr')];
          return rows.filter(r => r.textContent.includes('批量验收')).map(r => ({
            level:r.children[3]?.querySelector('.tag')?.className,
            status:r.children[4]?.querySelector('.tag')?.className,
          }));
        })()""")
        if len(tones) < 4 or not all('tone-' in row['level'] and 'tone-' in row['status'] for row in tones):
            raise RuntimeError(f'任务颜色标签缺失：{tones}')
        evaluate("[...document.querySelectorAll('.sidebar nav button')].find(b => b.textContent.includes('人员管理')).click()")
        wait_for("!!document.querySelector('.data-table tbody .account-active')", '人员状态颜色')
        print(json.dumps({'browser': 'admin-ok', 'batchClose': 2, 'batchCancel': 2,
                          'mixedSkipped': 2, 'unauthorizedDenied': True, 'audit': 4, 'taskTones': tones,
                          'accountTone': 'account-active'}, ensure_ascii=False))
    finally:
        chrome.terminate()
        try:
            chrome.wait(timeout=5)
        except subprocess.TimeoutExpired:
            chrome.kill()
