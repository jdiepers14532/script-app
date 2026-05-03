module.exports = {
  apps: [{
    name: 'script-backend',
    script: 'dist/index.js',
    cwd: '/srv/script/backend',
    env: {
      NODE_ENV: 'production',
    }
  }]
}
