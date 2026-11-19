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


with tempfile.TemporaryDirectory(prefix='nursemate-admin-', ignore_cleanup_errors=True) as profile:
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
        review_task = request('/tasks', 'POST', {
            'title': f'批量验收{stamp}-待审核口径', 'content': '仅供云端任务统计验收',
            'level': 'NORMAL', 'completionMode': 'REVIEW', 'feedbackRequired': True,
            'attachmentRequired': False, 'deadlineAt': deadline,
            'assigneeSelection': {'mode': 'ALL_ACTIVE'},
        })
        request(f"/tasks/{review_task['id']}/publish", 'POST', {})

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
          const complete = await fetch('/api/v1/me/tasks/' + CLOSE_ID + '/complete', options('POST'));
          const submit = await fetch('/api/v1/me/tasks/' + REVIEW_ID + '/submissions', {
            ...options('POST'),body:JSON.stringify({feedback:'任务统计验收反馈'})});
          return {close:close.status,cancel:cancel.status,complete:complete.status,submit:submit.status};
        })()""".replace('PASSWORD', json.dumps(nurse_password)).replace('CLOSE_ID', json.dumps(tasks[0]['id'])).replace('CANCEL_ID', json.dumps(tasks[2]['id'])).replace('REVIEW_ID', json.dumps(review_task['id']))
        denied = evaluate(permission_probe, await_promise=True)
        if denied != {'close': 403, 'cancel': 403, 'complete': 200, 'submit': 201}:
            raise RuntimeError(f'普通护士越权请求未被拒绝：{denied}')

        evaluate("[...document.querySelectorAll('.sidebar nav button')].find(b => b.textContent.includes('任务管理')).click()")
        wait_for("document.body?.innerText.includes('选择操作后勾选任务')", '任务列表')
        evaluate("[...document.querySelectorAll('.toolbar button')].find(b => b.textContent.includes('刷新')).click()")
        wait_for(f"document.body?.innerText.includes({json.dumps(tasks[0]['title'])})", '新任务列表')
        if evaluate("document.querySelector('.task-list input[type=checkbox]') !== null"):
            raise RuntimeError('未选择批量操作时不应显示勾选框')
        list_counts = request('/tasks?pageSize=100')['items']
        first = next(item for item in list_counts if item['id'] == tasks[0]['id'])
        if first['completedCount'] != 1 or first['unfinishedCount'] != first['assigneeCount'] - 1:
            raise RuntimeError(f'列表完成统计不正确：{first}')
        draft = next(item for item in list_counts if item['id'] == tasks[2]['id'])
        if draft['publishedAt'] is not None or draft['completedCount'] != 0:
            raise RuntimeError(f'草稿发起时间或人数不正确：{draft}')
        review = next(item for item in list_counts if item['id'] == review_task['id'])
        if review['pendingReviewCount'] != 1 or review['unfinishedCount'] != review['assigneeCount']:
            raise RuntimeError(f'待审核任务误计入已完成：{review}')
        review_records = request(f"/tasks/{review_task['id']}/records?pageSize=100")['items']
        excluded = next(item for item in review_records if item['recordStatus'] == 'PENDING')
        request(f"/tasks/{review_task['id']}/records/{excluded['id']}/exclude", 'POST',
                {'reason': '任务统计验收排除负责人'})
        after_exclusion = next(item for item in request('/tasks?pageSize=100')['items'] if item['id'] == review_task['id'])
        if after_exclusion['assigneeCount'] != review['assigneeCount'] - 1 or after_exclusion['unfinishedCount'] != review['unfinishedCount'] - 1:
            raise RuntimeError(f'排除负责人后列表统计未更新：{after_exclusion}')
        countdown = evaluate("""(() => {
          const row = [...document.querySelectorAll('.task-list tbody tr')].find(r => r.textContent.includes(TITLE));
          return row ? {completed:row.children[7].textContent,unfinished:row.children[6].textContent,
            remaining:row.children[8].textContent} : null;
        })()""".replace('TITLE', json.dumps(tasks[0]['title'])))
        if countdown['completed'] != '1' or not countdown['remaining'].startswith('剩余 '):
            raise RuntimeError(f'任务列表人数或倒计时未显示：{countdown}')
        time.sleep(1.2)
        later = evaluate("""(() => [...document.querySelectorAll('.task-list tbody tr')]
          .find(r => r.textContent.includes(TITLE))?.children[8].textContent)()""".replace('TITLE', json.dumps(tasks[0]['title'])))
        if later == countdown['remaining']:
            raise RuntimeError('剩余时间未逐秒更新')
        detail_expr = """(() => {
          const row = [...document.querySelectorAll('.task-list tbody tr')].find(r => r.textContent.includes(TITLE));
          row.querySelector('button:last-child').click();
        })()""".replace('TITLE', json.dumps(tasks[0]['title']))
        evaluate(detail_expr)
        wait_for("!!document.querySelector('.task-detail .progress-cards')", '任务进度看板')
        overview = evaluate("""(() => ({
          cards:[...document.querySelectorAll('.task-detail .progress-cards strong')].map(x=>Number(x.textContent)),
          rows:document.querySelectorAll('.task-detail tbody tr').length,
        }))()""")
        if overview['cards'][:3] != [first['assigneeCount'], 1, first['unfinishedCount']] or overview['rows'] != first['assigneeCount']:
            raise RuntimeError(f'进度看板与人员明细不一致：{overview}')
        evaluate("""(() => {const select=document.querySelector('.personnel-head select');select.value='COMPLETED';select.dispatchEvent(new Event('change',{bubbles:true}));})()""")
        wait_for("document.querySelectorAll('.task-detail tbody tr').length === 1", '已完成人员筛选')
        evaluate("document.querySelector('.task-detail .modal-head button').click()")
        evaluate('window.confirm = () => true')

        def choose_action(action):
            evaluate("""(() => {
              const picker=document.querySelector('.batch-choice select');
              picker.value=ACTION;
              picker.dispatchEvent(new Event('change',{bubbles:true}));
            })()""".replace('ACTION', json.dumps(action)))
            wait_for("!!document.querySelector('.task-list input[type=checkbox]')", '批量勾选入口')

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

        choose_action('close')
        select([tasks[0]['title'], tasks[1]['title'], tasks[2]['title']])
        evaluate("[...document.querySelectorAll('.batch-toolbar button')].find(b => b.textContent.includes('执行批量关闭')).click()")
        wait_for("document.querySelector('.batch-result')?.textContent.includes('已关闭 2 项；跳过 1 项；失败 0 项')", '批量关闭')

        choose_action('cancel')
        select([tasks[2]['title'], tasks[3]['title'], tasks[0]['title']])
        evaluate("[...document.querySelectorAll('.batch-toolbar button')].find(b => b.textContent.includes('执行批量取消')).click()")
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
        palette = evaluate("""(() => {
          const row = document.querySelector('.data-table tbody tr');
          const colors = {};
          for (const [column, prefix, values] of [
            [3, 'tone-', ['normal', 'important', 'urgent']],
            [4, 'tone-', ['draft', 'published', 'closed', 'withdrawn', 'cancelled']]
          ]) {
            const tag = row.children[column].querySelector('.tag');
            const original = tag.className;
            colors[column] = values.map(value => {
              tag.className = 'tag ' + prefix + value;
              return getComputedStyle(tag).backgroundColor;
            });
            tag.className = original;
          }
          return colors;
        })()""")
        if len(set(palette['3'])) != 3 or len(set(palette['4'])) != 5:
            raise RuntimeError(f'任务等级或状态颜色未区分：{palette}')
        evaluate("[...document.querySelectorAll('.sidebar nav button')].find(b => b.textContent.includes('人员管理')).click()")
        wait_for("!!document.querySelector('.data-table tbody .account-active')", '人员状态颜色')
        accounts = evaluate("""(() => {
          const tag = document.querySelector('.data-table tbody .account-active');
          const original = tag.className;
          const colors = [];
          for (const state of ['active', 'pending', 'locked', 'disabled']) {
            tag.className = 'tag account-' + state;
            colors.push(getComputedStyle(tag).backgroundColor);
          }
          tag.className = original;
          return colors;
        })()""")
        if len(set(accounts)) != 4:
            raise RuntimeError(f'管理端账号状态颜色未区分：{accounts}')
        print(json.dumps({'browser': 'admin-ok', 'batchClose': 2, 'batchCancel': 2,
                          'mixedSkipped': 2, 'unauthorizedDenied': True, 'audit': 4,
                          'progress': {'completed': first['completedCount'], 'unfinished': first['unfinishedCount'],
                                       'pendingReview': review['pendingReviewCount'], 'excludedRemoved': True},
                          'taskTones': tones,
                          'taskPalette': palette, 'accountPalette': accounts}, ensure_ascii=False))
    finally:
        chrome.terminate()
        try:
            chrome.wait(timeout=5)
        except subprocess.TimeoutExpired:
            chrome.kill()
