// Set this to the HTTPS API origin when publishing the frontend separately.
const configuredElectionAPI = 'https://scarf-vehicular-thirstily.ngrok-free.dev';
const localPreview = location.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
window.electionAPIBase = localPreview ? 'http://127.0.0.1:8081' : configuredElectionAPI;
