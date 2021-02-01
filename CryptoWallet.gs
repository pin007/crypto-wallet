/**
 * MIT License
 *
 * Copyright (c) 2021 Antonin Faltynek
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

/**
 * @OnlyCurrentDoc
 */
function onOpen() {
  let ui = SpreadsheetApp.getUi();
  ui.createMenu('Crypto Wallet')
      .addItem('Set API Key', 'promptCWAPIKey')
      .addItem('Set API Key storage', 'promptCWAPIKeyStorage')
      .addItem('Set API Cache expiration', 'promptCWCacheExpiration')
      .addToUi();
}

/**
 * Configure CryptoWallet API key. By default API key is saved in context of current user. f you need to share your
 * document with API key, configure API key storage to `document` to save API key in context of document.
 * @OnlyCurrentDoc
 */
function promptCWAPIKey() {
  let ui = SpreadsheetApp.getUi();
  let properties = PropertiesService.getUserProperties();
  let apiKey = properties.getProperty('CRYPTOWALLET_API_KEY');
  let apiKeyMasked = apiKey ? apiKey.substring(0, 4) + ' **** ' + apiKey.substring(60) : '';

  let result = ui.prompt(
      'Set API key',
      'Set API key for your CryptoCompare account.' +
      '\n\nCurrent API key: ' + (apiKeyMasked || ''),
      ui.ButtonSet.OK_CANCEL);

  let button = result.getSelectedButton();
  let newApiKey = result.getResponseText().replace(/\s+/g, '');
  if (button === ui.Button.OK) {
    if (newApiKey === '') {
      properties.deleteProperty('CRYPTOWALLET_API_KEY');
      ui.alert('API key removed.',
          ui.ButtonSet.OK);
    } else {
      properties.setProperty('CRYPTOWALLET_API_KEY', newApiKey);
      ui.alert('API key saved.',
          ui.ButtonSet.OK);
    }
  }
}

/**
 * @OnlyCurrentDoc
 */
function promptCWAPIKeyStorage() {
  let ui = SpreadsheetApp.getUi();
  let apiKeyStorage = getCWApiKeyStorage();
  let result = ui.prompt(
      'Set API Key storage',
      'Set storage for API key. For security reasons, changing API key storage will reset API key.' +
      '\n  - "document" to store API key in document context, so all users will be able to access it.' +
      '\n  - "user" (default) to store API key in user context, so only current user will be able to access it.' +
      '\n\nCurrent API Key storage: ' + apiKeyStorage,
      ui.ButtonSet.OK_CANCEL);
  let newApiKeyStorage = result.getResponseText().replace(/\s+/g, '');
  if (result.getSelectedButton() === ui.Button.OK) {
    setCWApiKeyStorage(newApiKeyStorage)
  }
}

/**
 * @OnlyCurrentDoc
 */
function promptCWCacheExpiration() {
  let ui = SpreadsheetApp.getUi();
  let expiration = getCWCacheExpiration();
  let result = ui.prompt(
      'Set API Cache expiration',
      'Set lifetime for cached data from API calls.' +
      '\n\nCurrent API Cache expiration: ' + expiration,
      ui.ButtonSet.OK_CANCEL);
  let newExpiration = result.getResponseText().replace(/\s+/g, '');
  if (result.getSelectedButton() === ui.Button.OK) {
    setCWCacheExpiration(newExpiration)
  }
}

/**
 * @OnlyCurrentDoc
 */
function getCWApiKey() {
  let properties = (getCWApiKeyStorage() === 'user') ? PropertiesService.getUserProperties() : PropertiesService.getDocumentProperties();
  return properties.getProperty('CRYPTOWALLET_API_KEY');
}

/**
 * @OnlyCurrentDoc
 */
function getCWApiKeyStorage() {
  return PropertiesService.getDocumentProperties().getProperty('CRYPTOWALLET_API_KEY_STORAGE') || 'user';
}

/**
 * @OnlyCurrentDoc
 */
function getCWCacheExpiration() {
  return PropertiesService.getDocumentProperties().getProperty('CRYPTOWALLET_CACHE_EXPIRATION') || 300;
}

/**
 * @OnlyCurrentDoc
 */
function setCWApiKey(apiKey) {
  let properties = (getCWApiKeyStorage() === 'user') ? PropertiesService.getUserProperties() : PropertiesService.getDocumentProperties();
  if (apiKey) {
    properties.setProperty('CRYPTOWALLET_API_KEY', apiKey);
    Logger.log('Property CRYPTOWALLET_API_KEY updated');
  } else {
    properties.deleteProperty('CRYPTOWALLET_API_KEY');
    Logger.log('Property CRYPTOWALLET_API_KEY removed');
  }
}

/**
 * @OnlyCurrentDoc
 */
function setCWApiKeyStorage(apiKeyStorage) {
  let oldApiKeyStorage = getCWApiKeyStorage();
  if (oldApiKeyStorage !== apiKeyStorage) {
    setCWApiKey('');
    if (apiKeyStorage) {
      PropertiesService.getDocumentProperties().setProperty('CRYPTOWALLET_API_KEY_STORAGE', apiKeyStorage);
      Logger.log('Property CRYPTOWALLET_API_KEY_STORAGE updated to "%s"', apiKeyStorage);
    } else {
      PropertiesService.getDocumentProperties().deleteProperty('CRYPTOWALLET_API_KEY_STORAGE');
      Logger.log('Property CRYPTOWALLET_API_KEY_STORAGE removed');
    }
  }
}

/**
 * @OnlyCurrentDoc
 */
function setCWCacheExpiration(expiration) {
  let oldExpiration = getCWCacheExpiration();
  if (oldExpiration !== expiration) {
    if (expiration) {
      PropertiesService.getDocumentProperties().setProperty('CRYPTOWALLET_CACHE_EXPIRATION', expiration);
      Logger.log('Property CRYPTOWALLET_CACHE_EXPIRATION updated to "%s"', expiration);
    } else {
      PropertiesService.getDocumentProperties().deleteProperty('CRYPTOWALLET_CACHE_EXPIRATION');
      Logger.log('Property CRYPTOWALLET_CACHE_EXPIRATION removed');
    }
  }
}

/**
 * Fetch data from CryptoWallet API. Function caches the data using Cache service for time period defined by
 * `CRYPTOWALLET_CACHE_EXPIRATION` property. Caching can be disabled by setting `0` to `CRYPTOWALLET_CACHE_EXPIRATION`.
 * @OnlyCurentDoc
 * @return Object representing JSON response from CryptoWallet API.
 */
function fetchCryptoCompare(api) {
  const url = 'https://min-api.cryptocompare.com/data';
  const apiKey = getCWApiKey();
  let options = {};
  let response = null;
  let data = null;

  let cache = CacheService.getDocumentCache();
  let cachedData = null;
  const cacheExpiration = getCWCacheExpiration();
  let cacheKey = 'CW(' + api.replace(/[^\w]+/g, '_') + ')';

  let lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (e) {
    throw new Error('Failed to obtain lock!')
  }

  if (cacheExpiration > 0) {
    cachedData = cache.get(cacheKey);
  }

  if (cachedData) {
    Logger.log('Using cached data for API %s', api);
    let cachedBlob = Utilities.newBlob('', 'application/x-gzip');
    cachedBlob.setBytes(Utilities.base64Decode(cachedData));
    data = Utilities.ungzip(cachedBlob).getDataAsString();
  } else {
    if (apiKey) {
      options['headers'] = {'authorization': 'Apikey ' + apiKey};
    }
    try {
      Logger.log('Calling CryptoCompare API %s', api);
      response = UrlFetchApp.fetch(url + api, options);
      data = response.getContentText();
      if (cacheExpiration > 0) {
        try {
          Logger.log('Caching data for API call %s for %ss', api, cacheExpiration);
          let cachedBlob = Utilities.gzip(Utilities.newBlob(data));
          cachedData = Utilities.base64Encode(cachedBlob.getBytes());
          cache.put(cacheKey, cachedData, cacheExpiration);
        } catch (e) {
          Logger.log('Failed to cache data for API call %s', api);
        }
      } else {
        Logger.log('Removing cache for API call %s', api);
        cache.remove(cacheKey);
      }
    } catch (e) {
      throw new Error('Failed to call CryptoCompare API: ' + e.message);
    }
  }

  if (lock) {
    lock.releaseLock();
  }

  return JSON.parse(data);

}

/**
 * @customfunction
 * @param {"[EXCHANGE:]FROM[/TO]"} ticker The crypto data to fetch, name of EXCHANGE is case-insensitive FROM is source
 *   and TO is target currency for conversion, default is "BTC/USD".
 * @param {"image"|"ohlcv_day"|"ohlcv_hour"|"ohlcv_minute"|"price"|...} attribute The attribute that should be returned
 *   for given currency, default is "price". For generic attributes see CryptoCompare API documentation
 *   https://min-api.cryptocompare.com/documentation?key=Price&cat=multipleSymbolsFullPriceEndpoint.
 * @param {number} limit The number of returned OHLCV data points.
 * @param {Date|string} toDate Return OHLCV data points before given date and time. Note that TODAY() function returns
 *   time part of 00:00:00 respective to time zone of active Spreadsheet. The OHLCV history data use UTC time zone.
 * @return Processed data from CryptoCompare API.
 */
function CRYPTOWALLET(ticker, attribute, limit, toDate, trigger) {
  let tickerMatch = ticker.match('^((?<exchange>\\w+):)?(?<fromSymbol>\\w+)(/(?<toSymbol>\\w+))?$');

  if (!tickerMatch) {
    throw new TypeError('"ticker" has invalid format, use "[EXCHANGE:]FROM[/TO]"');
  }

  let exchange = tickerMatch.groups.exchange || '';
  let fromSymbol = tickerMatch.groups.fromSymbol || 'BTC';
  let toSymbol = tickerMatch.groups.toSymbol || 'USD';
  let attr = attribute ? attribute.toUpperCase() : 'PRICE';
  let lim = limit || 1;
  let toTs = toDate ? (new Date(toDate)).valueOf() / 1000 : 0;

  let api = null;
  let data = null;

  if (attr.startsWith('OHLCV')) {
    let period = attr.split('_').pop().toLowerCase();
    api = `/v2/histo${period}?fsym=${fromSymbol}&tsym=${toSymbol}&limit=${lim}`;

    if (toTs > 0) {
      api = `${api}&toTs=${toTs}`;
    }

    data = fetchCryptoCompare(api);

    if (attr.startsWith('OHLCV_CHANGEPCT')) {
      return ((data.Data.Data[data.Data.Data.length - 1].close / data.Data.Data[0].close) - 1) * 100;
    } else if (attr.startsWith('OHLCV_CHANGE')) {
      return (data.Data.Data[data.Data.Data.length - 1].close - data.Data.Data[0].close);
    } else {
      let result = [];
      let timeZone = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
      result.push(["Date", "Open", "High", "Low", "Close", `Volume ${fromSymbol.toUpperCase()}`, `Volume ${toSymbol.toUpperCase()}`]);

      for (let len = data.Data.Data.length, i = lim < len ? len - lim : 0; i < len; i++) {
        let item = data.Data.Data[i];
        result.push([
          Utilities.formatDate(new Date(item.time * 1000), timeZone, "yyyy-MM-dd HH:mm:ss"),
          item.open,
          item.high,
          item.low,
          item.close,
          item.volumefrom,
          item.volumeto
        ]);
      }

      return result;
    }
  } else {
    if (attr === 'IMAGE') {
      data = fetchCryptoCompare(`/pricemultifull?fsyms=${fromSymbol}&tsyms=${toSymbol}`);
      return 'https://cryptocompare.com/' + data.RAW[fromSymbol][toSymbol]['IMAGEURL'];
    } else {
      if (exchange) {
        data = fetchCryptoCompare(`/generateAvg?e=${exchange}&fsym=${fromSymbol}&tsym=${toSymbol}`);
        data = data.RAW;
      } else {
        data = fetchCryptoCompare(`/pricemultifull?fsyms=${fromSymbol}&tsyms=${toSymbol}`);
        data = data.RAW[fromSymbol][toSymbol];
      }
    }
    if (attr in data) {
      return data[attr];
    } else {
      throw new TypeError(`Unknown attribute "${attr}", please check CryptoCompare API documentation`)
    }
  }
}
