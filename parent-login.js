function showError(message) {
  const banner = document.getElementById('error-banner');
  banner.textContent = message;
  banner.classList.add('visible');
}

function clearError() {
  const banner = document.getElementById('error-banner');
  banner.textContent = '';
  banner.classList.remove('visible');
}

async function handleParentLogin(event) {
  event.preventDefault();
  clearError();
  const button = document.getElementById('submit-btn');
  button.disabled = true;
  button.textContent = 'Signing in...';

  const usernameRaw = document.getElementById('username').value.trim();
  const pin = document.getElementById('pin').value.trim();
  const username = usernameRaw.toLowerCase().replace(/[^a-z0-9._-]/g, '');
  const email = `${username}@parent.local`;

  try {
    const { error } = await supabaseClient.auth.signInWithPassword({ email, password: pin });
    if (error) throw new Error('That username and PIN combination was not recognised. Check with the school if you are unsure.');

    window.location.href = 'parent-dashboard.html';
  } catch (err) {
    showError(err.message);
    button.disabled = false;
    button.textContent = 'Sign in';
  }
}
