module.exports = {
  apps: [{
    name: 'script-backend',
    script: 'dist/index.js',
    cwd: '/srv/script/backend',
    env: {
      NODE_ENV: 'production',
      PORT: 3014,
      DATABASE_URL: 'postgresql://script_user:ScriptDB2026@localhost:5432/script_db',
      PLAYWRIGHT_TEST_MODE: 'false'
    }
  }]
}
