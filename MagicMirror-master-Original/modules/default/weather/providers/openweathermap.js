/* global WeatherProvider, WeatherObject */

/*
 * This class is a provider for Openweathermap,
 * see https://openweathermap.org/
 */
WeatherProvider.register("openweathermap", {

	/*
	 * Set the name of the provider.
	 * This isn't strictly necessary, since it will fallback to the provider identifier
	 * But for debugging (and future alerts) it would be nice to have the real name.
	 */
	providerName: "OpenWeatherMap",

	// Set the default config properties that is specific to this provider
	defaults: {
		apiVersion: "3.0",
		apiBase: "https://api.openweathermap.org/data/",
		// weatherEndpoint is "/onecall" since API 3.0
		// "/onecall", "/forecast" or "/weather" only for pro customers
		weatherEndpoint: "/onecall",
		locationID: false,
		location: false,
		// the /onecall endpoint needs lat / lon values, it doesn't support the locationId
		lat: 0,
		lon: 0,
		apiKey: ""
	},

	// Overwrite the fetchCurrentWeather method.
	fetchCurrentWeather () {
		const url = this.getUrl();
		if (this.config.debug) {
			Log.info(`[openweathermap] current url=${url} lat=${this.config.lat} lon=${this.config.lon}`);
		}
		this._throttledFetch(url)
			.then((data) => {
				let currentWeather;
				if (this.config.weatherEndpoint === "/onecall") {
					currentWeather = this.generateWeatherObjectsFromOnecall(data).current;
					this.setFetchedLocation(`${data.timezone}`);
				} else {
					currentWeather = this.generateWeatherObjectFromCurrentWeather(data);
				}
				this.setCurrentWeather(currentWeather);
				// Se o UV não veio (ex.: fallback /weather), tenta buscar via endpoints alternativos
				if (currentWeather.uv_index === null || currentWeather.uv_index === undefined) {
					return this.fetchUVIndexFallback()
						.then((uv) => {
							if (uv !== null && uv !== undefined) {
								currentWeather.uv_index = uv;
								this.setCurrentWeather(currentWeather);
							}
						})
						.catch(() => {})
						.finally(() => this.updateAvailable());
				}
			})
			.catch((e) => {
				// Fallback for free-tier keys: retry with legacy endpoints (2.5/weather)
				const cod = e?.response?.cod ? Number(e.response.cod) : undefined;
				const msg = String(e?.message || "");
				if (!this._legacyTriedCurrent && (cod === 401 || (/Invalid API key|Unauthorized|You must use paid plan/i).test(msg))) {
					this._legacyTriedCurrent = true;
					// Primeiro tenta One Call v2.5 para obter UV/horário gratuitamente
					const prevVer = this.config.apiVersion; const prevEp = this.config.weatherEndpoint;
					this.config.apiVersion = "2.5";
					this.config.weatherEndpoint = "/onecall";
					return this._throttledFetch(this.getUrl())
						.then((data25) => {
							const cur = this.generateWeatherObjectsFromOnecall(data25).current;
							this.setCurrentWeather(cur);
							this.setFetchedLocation(`${data25.timezone}`);
						})
						.catch(() => {
							// Se v2.5/onecall também falhar, cai para /weather 2.5
							this.config.apiVersion = "2.5";
							this.config.weatherEndpoint = "/weather";
							return this._throttledFetch(this.getUrl())
								.then((data2) => {
									const cw = this.generateWeatherObjectFromCurrentWeather(data2);
									this.setCurrentWeather(cw);
									// tenta buscar UV dedicado
									if (cw.uv_index === null || cw.uv_index === undefined) {
										return this.fetchUVIndexFallback()
											.then((uv) => {
												if (uv !== null && uv !== undefined) {
													cw.uv_index = uv;
													this.setCurrentWeather(cw);
												}
											})
											.catch(() => {});
									}
								})
								.catch((e2) => Log.error("[openweathermap] legacy current failed", e2));
						})
						.finally(() => { this.config.apiVersion = prevVer; this.config.weatherEndpoint = prevEp; });
				}
				Log.error("Could not load data ... ", e);
			})
			.finally(() => this.updateAvailable());
	},

	// Overwrite the fetchWeatherForecast method.
	fetchWeatherForecast () {
		const url = this.getUrl();
		if (this.config.debug) {
			Log.info(`[openweathermap] forecast url=${url} lat=${this.config.lat} lon=${this.config.lon}`);
		}
		this._throttledFetch(url)
			.then((data) => {
				let forecast;
				let location;
				if (this.config.weatherEndpoint === "/onecall") {
					forecast = this.generateWeatherObjectsFromOnecall(data).days;
					location = `${data.timezone}`;
				} else {
					forecast = this.generateWeatherObjectsFromForecast(data.list);
					location = `${data.city.name}, ${data.city.country}`;
				}
				this.setWeatherForecast(forecast);
				this.setFetchedLocation(location);
			})
			.catch((e) => {
				const cod = e?.response?.cod ? Number(e.response.cod) : undefined;
				const msg = String(e?.message || "");
				if (!this._legacyTriedForecast && (cod === 401 || (/Invalid API key|Unauthorized|You must use paid plan/i).test(msg))) {
					this._legacyTriedForecast = true;
					if (this.config.debug) Log.warn("[openweathermap] 401 on One Call 3.0 forecast. Falling back to 2.5 /forecast endpoint.");
					this.config.apiVersion = "2.5";
					this.config.weatherEndpoint = "/forecast";
					return this._throttledFetch(this.getUrl())
						.then((data2) => {
							const fc = this.generateWeatherObjectsFromForecast(data2.list);
							this.setWeatherForecast(fc);
							this.setFetchedLocation(`${data2.city.name}, ${data2.city.country}`);
						})
						.catch((e2) => Log.error("[openweathermap] legacy forecast failed", e2));
				}
				Log.error("Could not load data ... ", e);
			})
			.finally(() => this.updateAvailable());
	},

	// Overwrite the fetchWeatherHourly method.
	fetchWeatherHourly () {
		const url = this.getUrl();
		if (this.config.debug) {
			Log.info(`[openweathermap] hourly url=${url} lat=${this.config.lat} lon=${this.config.lon}`);
		}
		this._throttledFetch(url)
			.then((data) => {
				if (!data) {

					/*
					 * Did not receive usable new data.
					 * Maybe this needs a better check?
					 */
					return;
				}

				this.setFetchedLocation(`(${data.lat},${data.lon})`);

				const weatherData = this.generateWeatherObjectsFromOnecall(data);
				this.setWeatherHourly(weatherData.hours);
			})
			.catch((e) => {
				// Fallback to 2.5 /forecast to approximate hourly when One Call 3.0 is unavailable
				const cod = e?.response?.cod ? Number(e.response.cod) : undefined;
				const msg = String(e?.message || "");
				if (!this._legacyTriedHourly && (cod === 401 || (/Invalid API key|Unauthorized|You must use paid plan/i).test(msg))) {
					this._legacyTriedHourly = true;
					const prevVersion = this.config.apiVersion; const prevEndpoint = this.config.weatherEndpoint;
					if (this.config.debug) Log.warn("[openweathermap] 401 on One Call 3.0 hourly. Trying 2.5 /onecall, then /forecast.");
					this.config.apiVersion = "2.5";
					this.config.weatherEndpoint = "/onecall";
					return this._throttledFetch(this.getUrl())
						.then((data25) => {
							const weatherData = this.generateWeatherObjectsFromOnecall(data25);
							this.setWeatherHourly(weatherData.hours);
							this.setFetchedLocation(`${data25.timezone}`);
						})
						.catch(() => {
							// Último fallback para /forecast (3h)
							this.config.weatherEndpoint = "/forecast";
							return this._throttledFetch(this.getUrl())
								.then((data2) => {
									const hours = this.generateHourlyFromForecastList(data2.list || []);
									this.setWeatherHourly(hours);
									this.setFetchedLocation(`${data2.city.name}, ${data2.city.country}`);
								})
								.catch((e2) => Log.error("[openweathermap] legacy hourly failed", e2));
						})
						.finally(() => { this.config.apiVersion = prevVersion; this.config.weatherEndpoint = prevEndpoint; });
				}
				Log.error("Could not load data ... ", e);
			})
			.finally(() => this.updateAvailable());
	},

	// Build an array of hourly-like WeatherObjects from 3-hour forecast list
	generateHourlyFromForecastList (list) {
		const hours = [];
		for (const fc of list) {
			const w = new WeatherObject();
			w.date = moment.unix(fc.dt);
			w.temperature = fc.main?.temp;
			w.humidity = fc.main?.humidity;
			w.windSpeed = fc.wind?.speed;
			w.windFromDirection = fc.wind?.deg;
			if (Array.isArray(fc.weather) && fc.weather[0]?.icon) w.weatherType = this.convertWeatherType(fc.weather[0].icon);
			if (typeof fc.pop === "number") w.precipitationProbability = fc.pop * 100;
			if (typeof fc.main?.pressure === "number") w.pressure = fc.main.pressure;
			if (typeof fc.visibility === "number") w.visibility = fc.visibility; // meters
			hours.push(w);
		}
		return hours;
	},

	// Fetch Air Quality (AQI, PM2.5, PM10, NO2, O3, SO2) via Air Pollution API
	fetchAirQuality () {
		const base = this.config.apiBase.replace(/\/data\/$/, "/");
		const url = `${base}data/2.5/air_pollution?lat=${this.config.lat}&lon=${this.config.lon}&appid=${this.config.apiKey}`;
		if (this.config.debug) Log.info(`[openweathermap] air url=${url}`);
		return this._throttledFetch(url)
			.then((aq) => {
				// Normalize minimal object
				const item = aq?.list?.[0];
				if (!item) return this.setAirQuality(null);
				const res = {
					aqi: item.main?.aqi ?? null, // 1..5 (1 melhor)
					pm2_5: item.components?.pm2_5,
					pm10: item.components?.pm10,
					o3: item.components?.o3,
					no2: item.components?.no2,
					so2: item.components?.so2,
					co: item.components?.co,
					ts: item.dt ? moment.unix(item.dt) : moment()
				};
				this.setAirQuality(res);
			})
			.catch((e) => Log.error("[openweathermap] air quality fetch failed", e))
			.finally(() => this.updateAvailable());
	},

	// Fallback fetch for UV index when not present in current payload (e.g., /weather path)
	fetchUVIndexFallback () {
		const prevVer = this.config.apiVersion; const prevEp = this.config.weatherEndpoint;
		// Try One Call v2.5 first
		this.config.apiVersion = "2.5";
		this.config.weatherEndpoint = "/onecall";
		return this._throttledFetch(this.getUrl())
			.then((d) => d?.current?.uvi ?? null)
			.catch(() => null)
			.then((maybeUvi) => {
				if (maybeUvi !== null && maybeUvi !== undefined) return maybeUvi;
				// Last resort: legacy /uvi endpoint (deprecated but may still work for some keys)
				const base = this.config.apiBase.replace(/\/data\/$/, "/");
				const url = `${base}data/2.5/uvi?lat=${this.config.lat}&lon=${this.config.lon}&appid=${this.config.apiKey}`;
				return this._throttledFetch(url).then((u) => u?.value ?? null).catch(() => null);
			})
			.finally(() => { this.config.apiVersion = prevVer; this.config.weatherEndpoint = prevEp; });
	},

	/**
	 * Throttled fetch wrapper specific to OpenWeather to ensure <=50 req/min.
	 * Shared static bucket across instances.
	 * @param {string} url full request URL
	 * @returns {Promise<any>} promise resolving with parsed response data
	 */
	_throttledFetch (url) {
		// Use a cross-environment root (browser/Node) to store the shared bucket
		let root;
		if (typeof globalThis !== "undefined") root = globalThis;
		else if (typeof window !== "undefined") root = window;
		else if (typeof global !== "undefined") root = global;
		else root = {};
		if (!root.__OWM_BUCKET__) {
			root.__OWM_BUCKET__ = { tokens: 50, lastRefill: Date.now(), queue: [] };
		}
		const bucket = root.__OWM_BUCKET__;
		const refill = () => {
			const now = Date.now();
			if (now - bucket.lastRefill >= 60000) {
				bucket.tokens = 50;
				bucket.lastRefill = now;
				while (bucket.tokens > 0 && bucket.queue.length) {
					bucket.tokens--;
					const next = bucket.queue.shift();
					if (next) next();
				}
			}
		};
		refill();
		if (bucket.tokens <= 0) {
			return new Promise((resolve, reject) => {
				bucket.queue.push(() => {
					this.fetchData(url).then(resolve).catch(reject);
				});
			});
		}
		bucket.tokens--;
		return this.fetchData(url).then((data) => {
			// Normalize and validate OpenWeather responses. On errors (e.g., 401), throw to caller.
			const hasOneCallPayload = data && (data.current || data.daily || data.hourly);
			const cod = typeof data?.cod !== "undefined" ? Number(data.cod) : undefined;
			const isError = (typeof cod === "number" && cod !== 200) || (!hasOneCallPayload && data?.message);
			if (isError) {
				const err = new Error(`[openweathermap] API error ${cod ?? ""} ${data?.message ?? "Invalid response"}`.trim());
				err.response = data;
				throw err;
			}
			return data;
		});
	},

	/** OpenWeatherMap Specific Methods - These are not part of the default provider methods */
	/*
	 * Gets the complete url for the request
	 */
	getUrl () {
		return this.config.apiBase + this.config.apiVersion + this.config.weatherEndpoint + this.getParams();
	},

	/*
	 * Generate a WeatherObject based on currentWeatherInformation
	 */
	generateWeatherObjectFromCurrentWeather (currentWeatherData) {
		const currentWeather = new WeatherObject();

		currentWeather.date = moment.unix(currentWeatherData.dt);
		currentWeather.humidity = currentWeatherData.main.humidity;
		currentWeather.temperature = currentWeatherData.main.temp;
		currentWeather.feelsLikeTemp = currentWeatherData.main.feels_like;
		currentWeather.windSpeed = currentWeatherData.wind.speed;
		currentWeather.windFromDirection = currentWeatherData.wind.deg;
		currentWeather.weatherType = this.convertWeatherType(currentWeatherData.weather[0].icon);
		currentWeather.pressure = currentWeatherData.main?.pressure;
		// visibility (meters) may be present in this payload
		if (typeof currentWeatherData.visibility === "number") currentWeather.visibility = currentWeatherData.visibility;
		currentWeather.sunrise = moment.unix(currentWeatherData.sys.sunrise);
		currentWeather.sunset = moment.unix(currentWeatherData.sys.sunset);

		return currentWeather;
	},

	/*
	 * Generate WeatherObjects based on forecast information
	 */
	generateWeatherObjectsFromForecast (forecasts) {
		if (this.config.weatherEndpoint === "/forecast") {
			return this.generateForecastHourly(forecasts);
		} else if (this.config.weatherEndpoint === "/forecast/daily") {
			return this.generateForecastDaily(forecasts);
		}
		// if weatherEndpoint does not match forecast or forecast/daily, what should be returned?
		return [new WeatherObject()];
	},

	/*
	 * Generate WeatherObjects based on One Call forecast information
	 */
	generateWeatherObjectsFromOnecall (data) {
		if (this.config.weatherEndpoint === "/onecall") {
			return this.fetchOnecall(data);
		}
		// if weatherEndpoint does not match onecall, what should be returned?
		return { current: new WeatherObject(), hours: [], days: [] };
	},

	/*
	 * Generate forecast information for 3-hourly forecast (available for free
	 * subscription).
	 */
	generateForecastHourly (forecasts) {
		// initial variable declaration
		const days = [];
		// variables for temperature range and rain
		let minTemp = [];
		let maxTemp = [];
		let rain = 0;
		let snow = 0;
		// variable for date
		let date = "";
		let weather = new WeatherObject();

		for (const forecast of forecasts) {
			if (date !== moment.unix(forecast.dt).format("YYYY-MM-DD")) {
				// calculate minimum/maximum temperature, specify rain amount
				weather.minTemperature = Math.min.apply(null, minTemp);
				weather.maxTemperature = Math.max.apply(null, maxTemp);
				weather.rain = rain;
				weather.snow = snow;
				weather.precipitationAmount = (weather.rain ?? 0) + (weather.snow ?? 0);
				// push weather information to days array
				days.push(weather);
				// create new weather-object
				weather = new WeatherObject();

				minTemp = [];
				maxTemp = [];
				rain = 0;
				snow = 0;

				// set new date
				date = moment.unix(forecast.dt).format("YYYY-MM-DD");

				// specify date
				weather.date = moment.unix(forecast.dt);

				// If the first value of today is later than 17:00, we have an icon at least!
				weather.weatherType = this.convertWeatherType(forecast.weather[0].icon);
			}

			if (moment.unix(forecast.dt).format("H") >= 8 && moment.unix(forecast.dt).format("H") <= 17) {
				weather.weatherType = this.convertWeatherType(forecast.weather[0].icon);
			}

			/*
			 * the same day as before
			 * add values from forecast to corresponding variables
			 */
			minTemp.push(forecast.main.temp_min);
			maxTemp.push(forecast.main.temp_max);

			if (forecast.hasOwnProperty("rain") && !isNaN(forecast.rain["3h"])) {
				rain += forecast.rain["3h"];
			}

			if (forecast.hasOwnProperty("snow") && !isNaN(forecast.snow["3h"])) {
				snow += forecast.snow["3h"];
			}
		}

		/*
		 * last day
		 * calculate minimum/maximum temperature, specify rain amount
		 */
		weather.minTemperature = Math.min.apply(null, minTemp);
		weather.maxTemperature = Math.max.apply(null, maxTemp);
		weather.rain = rain;
		weather.snow = snow;
		weather.precipitationAmount = (weather.rain ?? 0) + (weather.snow ?? 0);
		// push weather information to days array
		days.push(weather);
		return days.slice(1);
	},

	/*
	 * Generate forecast information for daily forecast (available for paid
	 * subscription or old apiKey).
	 */
	generateForecastDaily (forecasts) {
		// initial variable declaration
		const days = [];

		for (const forecast of forecasts) {
			const weather = new WeatherObject();

			weather.date = moment.unix(forecast.dt);
			weather.minTemperature = forecast.temp.min;
			weather.maxTemperature = forecast.temp.max;
			weather.weatherType = this.convertWeatherType(forecast.weather[0].icon);
			weather.rain = 0;
			weather.snow = 0;

			/*
			 * forecast.rain not available if amount is zero
			 * The API always returns in millimeters
			 */
			if (forecast.hasOwnProperty("rain") && !isNaN(forecast.rain)) {
				weather.rain = forecast.rain;
			}

			/*
			 * forecast.snow not available if amount is zero
			 * The API always returns in millimeters
			 */
			if (forecast.hasOwnProperty("snow") && !isNaN(forecast.snow)) {
				weather.snow = forecast.snow;
			}

			weather.precipitationAmount = weather.rain + weather.snow;
			weather.precipitationProbability = forecast.pop ? forecast.pop * 100 : undefined;

			days.push(weather);
		}

		return days;
	},

	/*
	 * Fetch One Call forecast information (available for free subscription).
	 * Factors in timezone offsets.
	 * Minutely forecasts are excluded for the moment, see getParams().
	 */
	fetchOnecall (data) {
		let precip = false;

		// get current weather, if requested
		const current = new WeatherObject();
		if (data.hasOwnProperty("current")) {
			current.date = moment.unix(data.current.dt).utcOffset(data.timezone_offset / 60);
			current.windSpeed = data.current.wind_speed;
			current.windFromDirection = data.current.wind_deg;
			current.sunrise = moment.unix(data.current.sunrise).utcOffset(data.timezone_offset / 60);
			current.sunset = moment.unix(data.current.sunset).utcOffset(data.timezone_offset / 60);
			current.temperature = data.current.temp;
			current.weatherType = this.convertWeatherType(data.current.weather[0].icon);
			current.humidity = data.current.humidity;
			current.pressure = data.current.pressure;
			current.uv_index = data.current.uvi;
			if (typeof data.current.dew_point === "number") current.dewPoint = data.current.dew_point;
			if (typeof data.current.visibility === "number") current.visibility = data.current.visibility;
			if (data.current.hasOwnProperty("rain") && !isNaN(data.current.rain["1h"])) {
				current.rain = data.current.rain["1h"];
				precip = true;
			}
			if (data.current.hasOwnProperty("snow") && !isNaN(data.current.snow["1h"])) {
				current.snow = data.current.snow["1h"];
				precip = true;
			}
			if (precip) {
				current.precipitationAmount = (current.rain ?? 0) + (current.snow ?? 0);
			}
			current.feelsLikeTemp = data.current.feels_like;
		}

		let weather = new WeatherObject();

		// get hourly weather, if requested
		const hours = [];
		if (data.hasOwnProperty("hourly")) {
			for (const hour of data.hourly) {
				weather.date = moment.unix(hour.dt).utcOffset(data.timezone_offset / 60);
				weather.temperature = hour.temp;
				weather.feelsLikeTemp = hour.feels_like;
				weather.humidity = hour.humidity;
				weather.windSpeed = hour.wind_speed;
				weather.windFromDirection = hour.wind_deg;
				weather.weatherType = this.convertWeatherType(hour.weather[0].icon);
				weather.precipitationProbability = hour.pop ? hour.pop * 100 : undefined;
				weather.uv_index = hour.uvi;
				if (typeof hour.dew_point === "number") weather.dewPoint = hour.dew_point;
				if (typeof hour.visibility === "number") weather.visibility = hour.visibility; // in meters
				precip = false;
				if (hour.hasOwnProperty("rain") && !isNaN(hour.rain["1h"])) {
					weather.rain = hour.rain["1h"];
					precip = true;
				}
				if (hour.hasOwnProperty("snow") && !isNaN(hour.snow["1h"])) {
					weather.snow = hour.snow["1h"];
					precip = true;
				}
				if (precip) {
					weather.precipitationAmount = (weather.rain ?? 0) + (weather.snow ?? 0);
				}

				hours.push(weather);
				weather = new WeatherObject();
			}
		}

		// get daily weather, if requested
		const days = [];
		if (data.hasOwnProperty("daily")) {
			for (const day of data.daily) {
				weather.date = moment.unix(day.dt).utcOffset(data.timezone_offset / 60);
				weather.sunrise = moment.unix(day.sunrise).utcOffset(data.timezone_offset / 60);
				weather.sunset = moment.unix(day.sunset).utcOffset(data.timezone_offset / 60);
				weather.minTemperature = day.temp.min;
				weather.maxTemperature = day.temp.max;
				weather.humidity = day.humidity;
				weather.pressure = day.pressure;
				weather.windSpeed = day.wind_speed;
				weather.windFromDirection = day.wind_deg;
				weather.weatherType = this.convertWeatherType(day.weather[0].icon);
				weather.precipitationProbability = day.pop ? day.pop * 100 : undefined;
				weather.uv_index = day.uvi;
				if (typeof day.dew_point === "number") weather.dewPoint = day.dew_point;
				precip = false;
				if (!isNaN(day.rain)) {
					weather.rain = day.rain;
					precip = true;
				}
				if (!isNaN(day.snow)) {
					weather.snow = day.snow;
					precip = true;
				}
				if (precip) {
					weather.precipitationAmount = (weather.rain ?? 0) + (weather.snow ?? 0);
				}

				days.push(weather);
				weather = new WeatherObject();
			}
		}

		return { current: current, hours: hours, days: days };
	},

	/*
	 * Convert the OpenWeatherMap icons to a more usable name.
	 */
	convertWeatherType (weatherType) {
		const weatherTypes = {
			"01d": "day-sunny",
			"02d": "day-cloudy",
			"03d": "cloudy",
			"04d": "cloudy-windy",
			"09d": "showers",
			"10d": "rain",
			"11d": "thunderstorm",
			"13d": "snow",
			"50d": "fog",
			"01n": "night-clear",
			"02n": "night-cloudy",
			"03n": "night-cloudy",
			"04n": "night-cloudy",
			"09n": "night-showers",
			"10n": "night-rain",
			"11n": "night-thunderstorm",
			"13n": "night-snow",
			"50n": "night-alt-cloudy-windy"
		};

		return weatherTypes.hasOwnProperty(weatherType) ? weatherTypes[weatherType] : null;
	},

	/*
	 * getParams(compliments)
	 * Generates an url with api parameters based on the config.
	 *
	 * return String - URL params.
	 */
	getParams () {
		let params = "?";
		if (this.config.weatherEndpoint === "/onecall") {
			params += `lat=${this.config.lat}`;
			params += `&lon=${this.config.lon}`;
			if (this.config.type === "current") {
				params += "&exclude=minutely,hourly,daily";
			} else if (this.config.type === "hourly") {
				params += "&exclude=current,minutely,daily";
			} else if (this.config.type === "daily" || this.config.type === "forecast") {
				params += "&exclude=current,minutely,hourly";
			} else {
				params += "&exclude=minutely";
			}
		} else if (this.config.lat && this.config.lon) {
			params += `lat=${this.config.lat}&lon=${this.config.lon}`;
		} else if (this.config.locationID) {
			params += `id=${this.config.locationID}`;
		} else if (this.config.location) {
			params += `q=${this.config.location}`;
		} else if (this.firstEvent?.geo) {
			params += `lat=${this.firstEvent.geo.lat}&lon=${this.firstEvent.geo.lon}`;
		} else if (this.firstEvent?.location) {
			params += `q=${this.firstEvent.location}`;
		} else {
			this.hide(this.config.animationSpeed, { lockString: this.identifier });
			return;
		}

		params += "&units=metric"; // WeatherProviders should use metric internally and use the units only for when displaying data
		params += `&lang=${this.config.lang}`;
		// Use lowercase 'appid' query parameter to comply with current OpenWeather expectations
		params += `&appid=${this.config.apiKey}`;

		return params;
	}
});
