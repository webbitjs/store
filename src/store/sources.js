import { normalizeKey } from '../util';
import { getSourceProvider } from './index';

class Source {}

const rawSources = {};
const sources = {};
const sourceObjectRefs = {};

const subscribers = {};
const subscribersAll = {};
let nextSubscriberId = 0;

const createRawSource = () => {
  return {
    __normalizedKey__: undefined,
    __fromProvider__: false,
    __key__: undefined,
    __value__: undefined,
    __sources__: {}
  };
};

const createSource = () => {
  return {
    getterValues: {},
    setters: {},
    sources: {}
  };
};

const getSourceObject = (providerName, key) => {
  if (typeof sourceObjectRefs[providerName] === 'undefined') {
    sourceObjectRefs[providerName] = {};
  }

  if (typeof sourceObjectRefs[providerName][key] === 'undefined') {
    sourceObjectRefs[providerName][key] = new Source();
  }

  return sourceObjectRefs[providerName][key];
};

const setSourceObjectProps = (providerName, key, rawSource) => {
  const value = getSourceObject(providerName, key);

  Object.getOwnPropertyNames(value).forEach(prop => {
    if (prop in rawSource.__sources__) {
      return;
    }
    delete value[prop];
  });

  for (let key in rawSource.__sources__) {

    if (key in value) {
      continue;
    }

    const rawSubSource = rawSource.__sources__[key];
    Object.defineProperty(value, key, {
      configurable: true,
      set(value) {
        const providerSources = sources[providerName];
        
        if (typeof providerSources === 'undefined') {
          return;
        }

        const setter = providerSources.setters[rawSubSource.__key__];

        if (typeof setter === 'undefined') {
          return;
        }

        setter(value);
      },
      get() {
        if (typeof sources[providerName] === 'undefined') {
          return undefined;
        }
        return sources[providerName].getterValues[rawSubSource.__key__];
      }
    });
  }
};

const notifySubscribers = (providerName, key) => {

  const keyParts = key.split('/');
  if (providerName in subscribers) {
    keyParts.forEach((keyPart, index) => {
      const sourceKey = keyParts.slice(0, index + 1).join('/');
      for (let id in subscribers[providerName][sourceKey] || {}) {
        const subscriber = subscribers[providerName][sourceKey][id];
        const source = getSource(providerName, sourceKey);
        subscriber(source, sourceKey, key);
      }
    });
  }

  if (providerName in subscribersAll) {
    for (let id in subscribersAll[providerName]) {
      const subscriber = subscribersAll[providerName][id];
      const source = getSource(providerName, key);
      subscriber(source, key);
    }
  }
};

const notifySubscribersRemoved = (providerName, keys) => {
  if (providerName in subscribers) {
    for (let key in subscribers[providerName]) {
      for (let id in subscribers[providerName][key]) {
        const subscriber = subscribers[providerName][key][id];
        subscriber(undefined, key, key);
      }
    }
  }

  if (providerName in subscribersAll) {
    for (let id in subscribersAll[providerName]) {
      const subscriber = subscribersAll[providerName][id];
      for (let key of keys) {
        subscriber(undefined, key);
      }
    }
  }
};

const isSourceType = (value) => {
  return value instanceof Object && value.constructor.name === 'Source';
};

const cleanSource = (providerName, rawSources, normalizedKeyParts) => {
  if (normalizedKeyParts.length === 0) {
    return false;
  }

  const keyPart = normalizedKeyParts[0];

  const rawSource = rawSources[keyPart];

  if (typeof rawSource === 'undefined') {
    return false;
  }

  if (normalizedKeyParts.length > 1) {
    cleanSource(providerName, rawSource.__sources__, normalizedKeyParts.slice(1));
  }

  if (
    Object.keys(rawSource.__sources__).length === 0 &&
    !rawSource.__fromProvider__
  ) {
    delete rawSources[keyPart];
  }

  if (typeof rawSources[keyPart] === 'undefined') {
    delete sources[providerName].sources[rawSource.__key__];
    delete sources[providerName].getterValues[rawSource.__key__];
    delete sources[providerName].setters[rawSource.__key__];
    return true;
  }

  const providerSources = sources[providerName];

  setSourceObjectProps(providerName, rawSource.__key__, rawSource);
  
  if (Object.keys(rawSource.__sources__).length === 0) {
    providerSources.getterValues[rawSource.__key__] = rawSource.__value__;
  }

  return true;
};

export const getRawSources = (providerName) => {
  return rawSources[providerName];
};

export const getRawSource = (providerName, key) => {
  let sourcesRoot = getRawSources(providerName);

  if (typeof sourcesRoot === 'undefined') {
    return null;
  }

  if (typeof key !== 'string') {
    return sourcesRoot;
  }

  const keyParts = normalizeKey(key).split('/');

  let sources = sourcesRoot.__sources__;

  for (let index in keyParts) {
    const keyPart = keyParts[index];

    if (keyParts.length - 1 === parseInt(index)) {
      return (keyPart in sources) ? sources[keyPart] : null;
    }

    if (keyPart in sources) {
      sources = sources[keyPart].__sources__;
    } else {
      return null;
    }
  }

  return null;
}

export const getSources = (providerName) => {
  if (providerName in sources) {
    return sources[providerName].sources;
  }
  return undefined;
};

export const getSource = (providerName, key) => {
  const sources = getSources(providerName);
  if (sources) {
    return sources[key];
  }
  return undefined;
};

export const subscribe = (providerName, key, callback, callImmediately) => {
  if (typeof callback !== 'function') {
    throw new Error('Callback is not a function');
  }

  if (subscribers[providerName] === undefined) {
    subscribers[providerName] = {};
  }

  if (subscribers[providerName][key] === undefined) {
    subscribers[providerName][key] = {};
  }

  const id = nextSubscriberId;
  nextSubscriberId++;
  subscribers[providerName][key][id] = callback;

  if (callImmediately) {
    const source = getSource(providerName, key);
    if (source !== undefined) {
      callback(source, key, key);
    }
  }

  const unsubscribe = () => {
    delete subscribers[providerName][key][id];
  };

  return unsubscribe;
};

export const subscribeAll = (providerName, callback, callImmediately) => {
  if (typeof callback !== 'function') {
    throw new Error('Callback is not a function');
  }

  if (subscribersAll[providerName] === undefined) {
    subscribersAll[providerName] = {};
  }

  const id = nextSubscriberId;
  nextSubscriberId++;
  subscribersAll[providerName][id] = callback;

  if (callImmediately) {
    const sources = getSources(providerName);
    Object.getOwnPropertyNames(sources).forEach(key => {
      const source = sources[key];
      callback(source, key);
    });
  }

  const unsubscribe = () => {
    delete subscribersAll[providerName][id];
  };

  return unsubscribe;
};

export const clearSources = (providerName) => {

  const hasSources = providerName in rawSources;

  if (!hasSources) {
    return;
  }

  const sourceKeys = Object.getOwnPropertyNames(getSources(providerName));

  for (let key in sources[providerName].getterValues) {
    const getterValue = sources[providerName].getterValues[key];
    if (isSourceType(getterValue)) {
      Object.getOwnPropertyNames(getterValue).forEach(prop => {
        delete getterValue[prop];
      });
    }
  }

  rawSources[providerName] = createRawSource();
  sources[providerName] = createSource();

  notifySubscribersRemoved(providerName, sourceKeys);
};

export const removeSources = (providerName) => {

  const hasSources = providerName in rawSources;

  if (!hasSources) {
    return;
  }

  const sourceKeys = Object.getOwnPropertyNames(getSources(providerName));

  for (let key in sources[providerName].getterValues) {
    const getterValue = sources[providerName].getterValues[key];
    if (isSourceType(getterValue)) {
      Object.getOwnPropertyNames(getterValue).forEach(prop => {
        delete getterValue[prop];
      });
    }
  }

  delete rawSources[providerName];
  delete sources[providerName];

  notifySubscribersRemoved(providerName, sourceKeys);
};

export const sourcesRemoved = (providerName, sourceRemovals) => {
  if (typeof rawSources[providerName] === 'undefined') {
    return;
  }

  const sourcesRoot = rawSources[providerName];

  for (let key of sourceRemovals) {
    const normalizedKey = normalizeKey(key);
    const normalizedKeyParts = normalizedKey.split('/');

    let rawSources = sourcesRoot.__sources__;

    for (let index in normalizedKeyParts) {

      const keyPart = normalizedKeyParts[index];
      const inSources = keyPart in rawSources;

      if (!inSources) {
        break;
      }

      if (normalizedKeyParts.length - 1 === parseInt(index)) {
        rawSources[keyPart].__fromProvider__ = false;
        rawSources[keyPart].__value__ = undefined;
      }

      rawSources = rawSources[keyPart].__sources__;
    }

    cleanSource(providerName, sourcesRoot.__sources__, normalizedKeyParts);
  }
};

export const sourcesChanged = (providerName, sourceChanges) => {

  if (typeof rawSources[providerName] === 'undefined') {
    rawSources[providerName] = createRawSource();
    sources[providerName] = createSource();
  }

  const sourcesRoot = rawSources[providerName];

  for (let key in sourceChanges) {

    const value = sourceChanges[key];

    const keyParts = key.split('/');
    const normalizedKey = normalizeKey(key);
    const normalizedKeyParts = normalizedKey.split('/');

    let rawSources = sourcesRoot.__sources__;
    let prevRawSource = {};

    normalizedKeyParts.forEach((keyPart, index) => {
      const inSources = keyPart in rawSources;
      const sourceKey = keyParts.slice(0, index + 1).join('/');
      const providerSources = sources[providerName];

      if (!inSources) {
        rawSources[keyPart] = {
          __fromProvider__: false,
          __normalizedKey__: normalizedKeyParts.slice(0, index + 1).join('/'),
          __key__: sourceKey,
          __value__: undefined,
          __sources__: {}
        }

        providerSources.getterValues[sourceKey] = getSourceObject(providerName, sourceKey);
        providerSources.setters[sourceKey] = () => {};
        Object.defineProperty(providerSources.sources, sourceKey, {
          configurable: true,
          set(value) {     
            const providerSources = sources[providerName];

            if (typeof providerSources === 'undefined') {
              return;
            }

            const setter = providerSources.setters[sourceKey];

            if (typeof setter === 'undefined') {
              return;
            }

            setter(value);
          },
          get() {
            if (typeof sources[providerName] === 'undefined') {
              return undefined;
            }
            return sources[providerName].getterValues[sourceKey];
          }
        });
      }

      if (normalizedKeyParts.length - 1 === index) {

        rawSources[keyPart].__fromProvider__ = true;
        rawSources[keyPart].__value__ = value;

        if (Object.keys(rawSources[keyPart].__sources__).length === 0) {
          providerSources.getterValues[sourceKey] = value;
        }

        const sourceProvider = getSourceProvider(providerName);
        providerSources.setters[sourceKey] = (value) => {
          sourceProvider.updateFromUser(sourceKey, value);
        };

      }

      if (index !== 0) {

        if (!isSourceType(providerSources.getterValues[prevRawSource.__key__])) {
          providerSources.getterValues[prevRawSource.__key__] = getSourceObject(providerName, prevRawSource.__key__);
        }

        setSourceObjectProps(providerName, prevRawSource.__key__, prevRawSource);
      }

      prevRawSource = rawSources[keyPart];
      rawSources = rawSources[keyPart].__sources__;
    });

    notifySubscribers(providerName, key);
  }
};