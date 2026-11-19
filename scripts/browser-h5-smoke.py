"""Run on the cloud test server with Chrome and websocket-client installed."""

import json
import os
import subprocess
import tempfile
import time
from pathlib import Path
from urllib.request import urlopen

import websocket


base = os.environ.get('H5_URL', 'http://127.0.0.1:8101/').rstrip('/') + '/'
employee_no = os.environ.get('SEED_HEAD_EMPLOYEE_NO', 'admin')
password = os.environ.get('SEED_HEAD_PASSWORD')
if not password:
    raise SystemExit('缺少 SEED_HEAD_PASSWORD')


with tempfile.TemporaryDirectory(prefix='nursemate-h5-') as profile:
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
        page = next(item for item in pages if item['type'] == 'page')
        ws = websocket.create_connection(page['webSocketDebuggerUrl'], timeout=20)
        errors = []
        responses = []
        next_id = 0

        def command(method, params=None):
            nonlocal_id = None
            global next_id
            next_id += 1
            nonlocal_id = next_id
            ws.send(json.dumps({'id': nonlocal_id, 'method': method, 'params': params or {}}))
            while True:
                message = json.loads(ws.recv())
                if message.get('method') == 'Runtime.exceptionThrown':
                    errors.append(message['params']['exceptionDetails'].get('text', '脚本异常'))
                if message.get('method') == 'Network.responseReceived':
                    response = message['params']['response']
                    if '/api/v1/' in response['url']:
                        responses.append((response['status'], response['url'].split('/api/v1/')[-1]))
                if message.get('id') == nonlocal_id:
                    if 'error' in message:
                        raise RuntimeError(message['error'])
                    return message.get('result', {})

        def evaluate(expression):
            result = command('Runtime.evaluate', {'expression': expression, 'returnByValue': True})
            return result.get('result', {}).get('value')

        command('Runtime.enable')
        command('Network.enable')
        for _ in range(100):
            if evaluate("document.body?.innerText.includes('账号登录')"):
                break
            time.sleep(0.1)
        else:
            raise RuntimeError(f'H5 未显示登录页：{evaluate("document.body?.innerText.slice(0, 300)")}')

        fill = """(() => {
          const fields = document.querySelectorAll('.login-card input');
          if (fields.length < 2) return false;
          for (const [field, value] of [[fields[0], EMPLOYEE], [fields[1], PASSWORD]]) {
            Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(field, value);
            field.dispatchEvent(new Event('input', { bubbles: true }));
          }
          document.querySelector('.login-card button.primary').click();
          return true;
        })()""".replace('EMPLOYEE', json.dumps(employee_no)).replace('PASSWORD', json.dumps(password))
        if not evaluate(fill):
            raise RuntimeError('H5 登录表单未找到')

        for _ in range(150):
            body = evaluate('document.body?.innerText') or ''
            if '重要提醒' in body and '正在加载' not in body and '加载失败' not in body:
                break
            time.sleep(0.1)
        else:
            raise RuntimeError(f'H5 登录后未加载数据：{body[:350]}；API：{responses[-8:]}；脚本异常：{errors[-3:]}')
        if not any(path == 'me/dashboard' and status == 200 for status, path in responses):
            raise RuntimeError(f'个人看板接口未成功：{responses[-8:]}')
        print(json.dumps({'browser': 'h5-ok', 'login': True, 'dashboard': True, 'api': responses[-5:]}, ensure_ascii=False))
    finally:
        chrome.terminate()
        try:
            chrome.wait(timeout=5)
        except subprocess.TimeoutExpired:
            chrome.kill()
