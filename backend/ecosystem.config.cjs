module.exports = {
  apps: [{
    name: 'script-backend',
    script: 'dist/index.js',
    cwd: '/srv/script/backend',
    kill_timeout: 10000,
    env: {
      NODE_ENV: 'production',
    }
  }]
}
