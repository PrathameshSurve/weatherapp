const GEO_API_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const WEATHER_API_URL = 'https://api.open-meteo.com/v1/forecast';

const form = document.getElementById('weather-form');
const cityInput = document.getElementById('city-input');
const searchButton = document.getElementById('search-button');
const statusMessage = document.getElementById('status-message');
const resultsContainer = document.getElementById('results');

const weatherCodeMap = {
  0: '☀️ Clear',
  1: '🌤️ Mainly clear',
  2: '⛅ Partly cloudy',
  3: '☁️ Overcast',
  45: '🌫️ Fog',
  48: '🌫️ Depositing rime fog',
  51: '🌦️ Light drizzle',
  53: '🌦️ Moderate drizzle',
  55: '🌧️ Dense drizzle',
  56: '🥶 Light freezing drizzle',
  57: '🥶 Dense freezing drizzle',
  61: '🌧️ Slight rain',
  63: '🌧️ Moderate rain',
  65: '⛈️ Heavy rain',
  66: '🌧️ Light freezing rain',
  67: '❄️ Heavy freezing rain',
  71: '🌨️ Slight snow',
  73: '🌨️ Moderate snow',
  75: '❄️ Heavy snow',
  77: '🌨️ Snow grains',
  80: '🌧️ Slight rain showers',
  81: '🌧️ Moderate rain showers',
  82: '⛈️ Violent rain showers',
  85: '🌨️ Slight snow showers',
  86: '❄️ Heavy snow showers',
  95: '⛈️ Thunderstorm',
  96: '⛈️ Thunderstorm with slight hail',
  99: '⛈️ Thunderstorm with heavy hail',
};

function setLoading(isLoading) {
  searchButton.disabled = isLoading;
  cityInput.disabled = isLoading;
  createStatus(isLoading ? 'Loading weather data…' : '', false, isLoading);
}

function createStatus(message, isError = false, isLoading = false) {
  statusMessage.textContent = message;
  statusMessage.style.color = isError ? '#ffb7c0' : '#a4beff';
  statusMessage.classList.toggle('loading', isLoading);
}

function normalizeCityInput(input) {
  return input
    .split(/[,\n]/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function getWeatherDescription(code) {
  return weatherCodeMap[code] || 'Unknown conditions';
}

function buildCard(title, content, isError = false) {
  const card = document.createElement('article');
  card.className = `card${isError ? ' error' : ''}`;
  card.innerHTML = `<h2>${title}</h2>${content}`;
  return card;
}

function createWeatherCard(city, weather) {
  const content = `
    <div class="metric"><span>Temperature</span><span>${weather.temperature}°C</span></div>
    <div class="metric"><span>Wind Speed</span><span>${weather.windSpeed} km/h</span></div>
    <div class="metric"><span>Humidity</span><span>${weather.humidity}%</span></div>
    <div class="metric"><span>Condition</span><span>${weather.condition}</span></div>
  `;

  return buildCard(city, content);
}

function createErrorCard(city, message) {
  const content = `<p>${message}</p>`;
  return buildCard(city, content, true);
}

async function fetchCityCoordinates(city) {
  const url = `${GEO_API_URL}?name=${encodeURIComponent(city)}&count=1&language=en&format=json`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('Geocoding request failed');
  }

  const data = await response.json();
  if (!data.results || data.results.length === 0) {
    throw new Error('City not found');
  }

  const { latitude, longitude, name, country } = data.results[0];
  return { latitude, longitude, label: `${name}, ${country}` };
}

async function fetchWeatherForCoordinates(latitude, longitude) {
  const url = `${WEATHER_API_URL}?latitude=${latitude}&longitude=${longitude}&current_weather=true&hourly=relativehumidity_2m&timezone=auto`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('Weather request failed');
  }

  const data = await response.json();
  const current = data.current_weather;
  if (!current) {
    throw new Error('Current weather data unavailable');
  }

  const humidity = extractHumidity(data, current.time);
  return {
    temperature: Math.round(current.temperature),
    windSpeed: Math.round(current.windspeed),
    humidity: humidity !== null ? humidity : 'N/A',
    condition: getWeatherDescription(current.weathercode),
  };
}

function extractHumidity(data, currentTime) {
  const { hourly } = data;
  if (!hourly || !hourly.time || !hourly.relativehumidity_2m) {
    return null;
  }

  const index = hourly.time.indexOf(currentTime);
  if (index === -1) {
    return null;
  }

  return hourly.relativehumidity_2m[index];
}

async function fetchWeatherForCity(city) {
  const coords = await fetchCityCoordinates(city);
  const weather = await fetchWeatherForCoordinates(coords.latitude, coords.longitude);
  return { city: coords.label, weather };
}

async function handleSearch(event) {
  event.preventDefault();
  resultsContainer.innerHTML = '';

  const cities = normalizeCityInput(cityInput.value);
  if (cities.length === 0) {
    createStatus('Please enter at least one city name.', true);
    return;
  }

  setLoading(true);
  const requests = cities.map((city) =>
    fetchWeatherForCity(city)
      .then((data) => ({ status: 'fulfilled', value: data }))
      .catch((error) => ({ status: 'rejected', reason: error, city }))
  );

  const results = await Promise.all(requests);
  results.forEach((result) => {
    if (result.status === 'fulfilled') {
      const card = createWeatherCard(result.value.city, result.value.weather);
      resultsContainer.appendChild(card);
    } else {
      const card = createErrorCard(result.city, result.reason.message);
      resultsContainer.appendChild(card);
    }
  });

  const successCount = results.filter((item) => item.status === 'fulfilled').length;
  const errorCount = results.length - successCount;
  createStatus(
    `Loaded weather for ${successCount} ${successCount === 1 ? 'city' : 'cities'}${
      errorCount > 0 ? ` · ${errorCount} failed` : ''
    }.`
  );
  setLoading(false);
}

form.addEventListener('submit', handleSearch);
