module.exports = {
    apps: [
      {
        name: 'splash-relay',
        script: 'npm start',
        cwd: '/opt/splash/splash-relay/',
        time: true,
        instances: 1,
        autorestart: true,
        max_restarts: 50,
        watch: false,
        max_memory_restart: '1G',
        env: { },
      },
    ],
  }
  