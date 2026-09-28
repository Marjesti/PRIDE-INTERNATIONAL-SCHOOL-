function initialsFromName(name) {
  if (!name) return 'RM';
  const parts = name.trim().split(/\s+/);
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
}

async function loadPublicBranding() {
  const logoEl = document.getElementById('auth-logo');
  if (!logoEl) return;

  try {
    const { data, error } = await supabaseClient.rpc('get_school_branding');
    const branding = Array.isArray(data) ? data[0] : data;
    if (error || !branding) return;

    if (branding.logo_url) {
      logoEl.outerHTML = `<img src="${branding.logo_url}" alt="${branding.name || 'School logo'}" class="auth-logo-img" id="auth-logo">`;
    } else {
      logoEl.outerHTML = `<img src="assets/logo.png" alt="${branding.name || 'School logo'}" class="auth-logo-img" id="auth-logo">`;
    }
  } catch (e) {
    // Fail silently -- the placeholder logo stays as-is.
  }
}

loadPublicBranding();
