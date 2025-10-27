const dial = require("peer-dial");
const http = require('node:http');
const express = require('express');
const { MODULE_NOTIFICATIONS } = require('./constants.js');
const querystring = require('node:querystring');

const app = express();
const PORT = 8569;
const MANUFACTURER = "MMM-Screencast";
const MODEL_NAME = "DIAL Server";

const apps = {
  "YouTube": {
    name: "YouTube",
    state: "stopped",
    allowStop: true,
    pid: null,
    url: null
  }
};

class DialServer {
  dialServer = null;
  _mmSendSocket = null;
  _castAppName = null;
  config = {};
  server = http.createServer(app);

  initDialServer(port) {
    this.dialServer = new dial.Server({
      port,
      corsAllowOrigins: true,
      expressApp: app,
      prefix: "/dial",
      manufacturer: MANUFACTURER,
      modelName: MODEL_NAME,
      launchFunction: null,
      delegate: {
        getApp: function(appName) {
          return apps[appName];
        },
        
        launchApp: (appName, lauchData, callback) => {
          const castApp = apps[appName];
          if (castApp) {
            const url = "https://www.youtube.com/tv?" + lauchData;
            const parsedLaunchData = this.parseLaunchData(lauchData);
            console.info("[MMM-Screencast] dial launch incoming", {
              appName,
              rawLaunchData: lauchData,
              parsedLaunchData,
              isLikelyQuery: typeof lauchData === 'string' && lauchData.includes('pairingCode=')
            });
            if (this.config?.debug) {
              const debugPayload = {
                appName,
                rawLaunchData: lauchData,
                parsedLaunchData
              };
              console.info("[MMM-Screencast] launchApp payload", debugPayload);
            }
            castApp.pid = 'run';
            castApp.state = 'starting';
            castApp.url = url;

            this.mmSendSocket(MODULE_NOTIFICATIONS.launch_app, {
              app: appName,
              state: castApp.state,
              url,
              launchData: parsedLaunchData,
              rawLaunchData: lauchData
            });

            castApp.state = 'running';
            this._castAppName = appName;
            this.mmSendSocket(MODULE_NOTIFICATIONS.run_app, {
              app: appName,
              state: castApp.state,
              url,
              launchData: parsedLaunchData,
              rawLaunchData: lauchData
            });
            if (this.config?.debug) {
              console.info("[MMM-Screencast] runApp state", {
                appName,
                url,
                launchData: parsedLaunchData
              });
            }
            callback(castApp.pid);
          }
        },
        stopApp: (appName, pid, callback) => {
          console.log("Got request to stop", appName," with pid: ", pid);
          const castApp = apps[appName];
          
          if (castApp && castApp.pid == pid) {
            castApp.state = 'stopped';
            castApp.pid = null;
            castApp.url = null;
            this._castAppName = null;
            this.mmSendSocket(MODULE_NOTIFICATIONS.stop_app, {
              app: appName,
              state: castApp.state
            });
            callback(true);
          } else {
            callback(false);
          }
        }
      }
    });
  }

  start() {
    const { castName, port, useIPv6 = false } = this.config;
  const usePort = port ?? PORT;

    this.initDialServer(usePort);

  if (castName) {
      this.dialServer.friendlyName = castName;
    }

    this.server.listen(usePort,
      useIPv6 ? '::' : '0.0.0.0',
      () => {
        this.dialServer.start();
        this.mmSendSocket(MODULE_NOTIFICATIONS.start_dial, { port: usePort });
      });
  }

  stopCast() {
    if (this._castAppName) {
      this.dialServer.delegate.stopApp(this._castAppName, 'run', (e) => false);
    }
  }

  get castSocket() {
    return null;
  }

  get mmSendSocket() {
    return this._mmSendSocket;
  }

  set mmSendSocket(socket) {
    this._mmSendSocket = socket;
  }

  setConfig(_c) {
    this.config = _c;
  }

  parseLaunchData(raw) {
    if (!raw) {
      return null;
    }

    const attempts = [
      () => JSON.parse(raw),
  () => JSON.parse(Buffer.from(raw, 'base64').toString('utf-8')),
  () => JSON.parse(Buffer.from(raw.replaceAll(/\s+/g, '+'), 'base64').toString('utf-8')),
  () => JSON.parse(Buffer.from(decodeURIComponent(raw), 'base64').toString('utf-8')),
  () => JSON.parse(Buffer.from(decodeURIComponent(raw).replaceAll(/\s+/g, '+'), 'base64').toString('utf-8')),
      () => querystring.parse(raw),
      () => querystring.parse(decodeURIComponent(raw)),
      () => querystring.parse(Buffer.from(raw, 'base64').toString('utf-8')),
      () => {
        const decoded = Buffer.from(raw.replaceAll(/\s+/g, '+'), 'base64').toString('utf-8');
        return querystring.parse(decoded);
      }
    ];

    for (const attempt of attempts) {
      try {
        const result = attempt();
        if (result && typeof result === 'object') {
          return result;
        }
      } catch (error) {
        console.debug("[MMM-Screencast] parseLaunchData tentativa falhou", error.message);
      }
    }

    return raw;
  }

}

module.exports = DialServer;
