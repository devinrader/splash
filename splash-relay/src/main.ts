import SplashRelay from "./SplashRelay.js";

// Entry point of the application
function main() {

  //load configuration data
  //const config = LoadConfiguration()

  const app = new SplashRelay();
  //const app = new SplashRelay(config);
  app.start();
}

main();