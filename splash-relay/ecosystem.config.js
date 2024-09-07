module.exports = {
    apps: [
      {
        name: 'splash-relay',
        script: 'npm start',
        time: true,
        instances: 1,
        autorestart: true,
        max_restarts: 50,
        watch: false,
        max_memory_restart: '1G',
        env: { },
      },
    ],
    deploy: {
      production: {
        user: 'devinrader',
        host: 'relay.rader.haus',
        key: '~/.ssh/deploy.key',
        ref: 'origin/main',
        repo: 'http://teacup.rader.haus:3000/devin/splash',
        path: '/home/devinrader/splash/splash-relay',
        'post-deploy':
          'yarn install && yarn build && pm2 reload ecosystem.config.js --env production && pm2 save && git checkout yarn.lock',
        env: {
          NODE_ENV: 'production',
          SPLASH_SERVER_ADDRESS: process.env.SPLASH_SERVER_ADDRESS
        },
      },
    },
  }
  