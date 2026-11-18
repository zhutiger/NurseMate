const panels = [...document.querySelectorAll('[data-screen-panel]')];
const screenButtons = [...document.querySelectorAll('[data-screen]')];
const roleButtons = [...document.querySelectorAll('[data-role]')];
const menus = [...document.querySelectorAll('[data-menu]')];
const title = document.querySelector('#preview-title');
const toast = document.querySelector('#toast');

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  window.setTimeout(() => toast.classList.remove('show'), 2200);
}

function showScreen(screenName) {
  const panel = panels.find((item) => item.dataset.screenPanel === screenName);
  if (!panel) return;

  panels.forEach((item) => item.classList.toggle('active', item === panel));
  screenButtons.forEach((item) => item.classList.toggle('active', item.dataset.screen === screenName));
  title.textContent = panel.dataset.title;
  document.querySelector('.preview-area').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

screenButtons.forEach((button) => button.addEventListener('click', () => showScreen(button.dataset.screen)));
document.querySelectorAll('[data-go]').forEach((button) => button.addEventListener('click', () => showScreen(button.dataset.go)));

roleButtons.forEach((button) => {
  button.addEventListener('click', () => {
    roleButtons.forEach((item) => item.classList.toggle('active', item === button));
    menus.forEach((menu) => menu.classList.toggle('hidden', menu.dataset.menu !== button.dataset.role));
    showScreen(button.dataset.role === 'admin' ? 'admin-dashboard' : 'home');
  });
});

document.querySelector('#bind-form').addEventListener('submit', (event) => {
  event.preventDefault();
  showToast('账号激活成功，小程序正在关联微信身份');
  window.setTimeout(() => showScreen('home'), 500);
});

document.querySelector('#login-form').addEventListener('submit', (event) => {
  event.preventDefault();
  showToast('登录成功');
  window.setTimeout(() => showScreen('home'), 400);
});

document.querySelector('#confirm-notice').addEventListener('click', () => {
  document.querySelector('#notice-action').innerHTML = `
    <div class="submitted-card">
      <span class="success-mark">✓</span>
      <h3>已阅读并知晓</h3>
      <p>确认时间：刚刚</p>
      <small>确认版本：V1</small>
    </div>`;
  document.querySelector('#home-notice-count').textContent = '0';
  showToast('确认记录已保存');
});

document.querySelector('#task-form').addEventListener('submit', (event) => {
  event.preventDefault();
  document.querySelector('#task-form').classList.add('hidden');
  document.querySelector('#submitted-card').classList.remove('hidden');
  document.querySelector('#home-task-count').textContent = '0';
  document.querySelector('#task-list-status').textContent = '已提交 ›';
  showToast('任务反馈已提交，等待审核');
});

document.querySelectorAll('[data-publish-type]').forEach((button) => {
  button.addEventListener('click', () => {
    document.querySelectorAll('[data-publish-type]').forEach((item) => item.classList.toggle('active', item === button));
    document.querySelector('#completion-mode-field').classList.toggle('hidden', button.dataset.publishType !== 'task');
    showToast(button.dataset.publishType === 'notice' ? '已选择阅读确认通知' : '已选择工作任务');
  });
});

document.querySelector('#publish-form').addEventListener('submit', (event) => {
  event.preventDefault();
  showScreen('publish-preview');
  showToast('预览已生成，正式发布前还需二次确认');
});

document.querySelector('#confirm-publish').addEventListener('click', () => {
  showToast('已发布并生成 10 名接收人记录');
  window.setTimeout(() => showScreen('admin-dashboard'), 600);
});

document.querySelector('#send-reminder').addEventListener('click', (event) => {
  event.currentTarget.disabled = true;
  event.currentTarget.textContent = '已催办 4 人';
  showToast('已向 4 名未确认人员发起催办');
});

document.querySelector('#approve-task').addEventListener('click', () => {
  document.querySelector('.review-actions').classList.add('hidden');
  document.querySelector('#review-result').classList.remove('hidden');
  document.querySelector('#review-result-text').textContent = '任务已审核通过';
  showToast('审核结果已保存');
});

document.querySelector('#reject-task').addEventListener('click', () => {
  const comment = document.querySelector('#review-comment').value.trim();
  if (!comment) {
    showToast('退回补充时请填写审核意见');
    document.querySelector('#review-comment').focus();
    return;
  }
  document.querySelector('.review-actions').classList.add('hidden');
  document.querySelector('#review-result').classList.remove('hidden');
  document.querySelector('#review-result-text').textContent = '已退回护士补充';
  showToast('退回结果已保存');
});

