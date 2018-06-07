'use strict';

var _getIterator2 = require('babel-runtime/core-js/get-iterator');

var _getIterator3 = _interopRequireDefault(_getIterator2);

var _from = require('babel-runtime/core-js/array/from');

var _from2 = _interopRequireDefault(_from);

var _map = require('babel-runtime/core-js/map');

var _map2 = _interopRequireDefault(_map);

var _promise = require('babel-runtime/core-js/promise');

var _promise2 = _interopRequireDefault(_promise);

var _stringify = require('babel-runtime/core-js/json/stringify');

var _stringify2 = _interopRequireDefault(_stringify);

var _typeof2 = require('babel-runtime/helpers/typeof');

var _typeof3 = _interopRequireDefault(_typeof2);

var _assign = require('babel-runtime/core-js/object/assign');

var _assign2 = _interopRequireDefault(_assign);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var ecc = require('eosjs-ecc');
var Fcbuffer = require('fcbuffer');
var EosApi = require('eosjs-api');
var assert = require('assert');

var Structs = require('./structs');
var AbiCache = require('./abi-cache');
var AssetCache = require('./asset-cache');
var writeApiGen = require('./write-api');
var format = require('./format');
var schema = require('./schema');
var pkg = require('../package.json');

var configDefaults = {
  broadcast: true,
  debug: false,
  sign: true
};

var Eos = function Eos() {
  var config = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
  return createEos((0, _assign2.default)({}, {
    apiLog: consoleObjCallbackLog(config.verbose),
    transactionLog: consoleObjCallbackLog(config.verbose)
  }, configDefaults, config));
};

module.exports = Eos;

(0, _assign2.default)(Eos, {
  version: pkg.version,
  modules: {
    format: format,
    api: EosApi,
    ecc: ecc,
    json: {
      api: EosApi.api,
      schema: schema
    },
    Fcbuffer: Fcbuffer
  },

  /** @deprecated */
  Testnet: function Testnet(config) {
    console.error('deprecated, change Eos.Testnet(..) to just Eos(..)');
    return Eos(config);
  },

  /** @deprecated */
  Localnet: function Localnet(config) {
    console.error('deprecated, change Eos.Localnet(..) to just Eos(..)');
    return Eos(config);
  }
});

function createEos(config) {
  var network = EosApi(config);
  config.network = network;

  config.assetCache = AssetCache(network);
  config.abiCache = AbiCache(network, config);

  if (!config.chainId) {
    config.chainId = 'cf057bbfb72640471fd910bcb67639c22df9f92470936cddc1ade0e2f2e7dc4f';
  }

  checkChainId(network, config.chainId);

  if (config.mockTransactions != null) {
    if (typeof config.mockTransactions === 'string') {
      var mock = config.mockTransactions;
      config.mockTransactions = function () {
        return mock;
      };
    }
    assert.equal((0, _typeof3.default)(config.mockTransactions), 'function', 'config.mockTransactions');
  }

  var _Structs = Structs(config),
      structs = _Structs.structs,
      types = _Structs.types,
      fromBuffer = _Structs.fromBuffer,
      toBuffer = _Structs.toBuffer;

  var eos = mergeWriteFunctions(config, EosApi, structs);

  (0, _assign2.default)(eos, { fc: {
      structs: structs,
      types: types,
      fromBuffer: fromBuffer,
      toBuffer: toBuffer
    } });

  if (!config.signProvider) {
    config.signProvider = defaultSignProvider(eos, config);
  }

  return eos;
}

function consoleObjCallbackLog() {
  var verbose = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : false;

  return function (error, result, name) {
    if (error) {
      if (name) {
        console.error(name, 'error');
      }
      console.error(error);
    } else if (verbose) {
      if (name) {
        console.log(name, 'reply:');
      }
      console.log((0, _stringify2.default)(result, null, 4));
    }
  };
}

/**
  Merge in write functions (operations).  Tested against existing methods for
  name conflicts.

  @arg {object} config.network - read-only api calls
  @arg {object} EosApi - api[EosApi] read-only api calls
  @return {object} - read and write method calls (create and sign transactions)
  @throw {TypeError} if a funciton name conflicts
*/
function mergeWriteFunctions(config, EosApi, structs) {
  assert(config.network, 'network instance required');
  var network = config.network;


  var merge = (0, _assign2.default)({}, network);

  var writeApi = writeApiGen(EosApi, network, structs, config, schema);
  throwOnDuplicate(merge, writeApi, 'Conflicting methods in EosApi and Transaction Api');
  (0, _assign2.default)(merge, writeApi);

  return merge;
}

function throwOnDuplicate(o1, o2, msg) {
  for (var key in o1) {
    if (o2[key]) {
      throw new TypeError(msg + ': ' + key);
    }
  }
}

/**
  The default sign provider is designed to interact with the available public
  keys (maybe just one), the transaction, and the blockchain to figure out
  the minimum set of signing keys.

  If only one key is available, the blockchain API calls are skipped and that
  key is used to sign the transaction.
*/
var defaultSignProvider = function defaultSignProvider(eos, config) {
  return async function (_ref) {
    var sign = _ref.sign,
        buf = _ref.buf,
        transaction = _ref.transaction;
    var keyProvider = config.keyProvider;


    if (!keyProvider) {
      throw new TypeError('This transaction requires a config.keyProvider for signing');
    }

    var keys = keyProvider;
    if (typeof keyProvider === 'function') {
      keys = keyProvider({ transaction: transaction });
    }

    // keyProvider may return keys or Promise<keys>
    keys = await _promise2.default.resolve(keys);

    if (!Array.isArray(keys)) {
      keys = [keys];
    }

    keys = keys.map(function (key) {
      try {
        // normalize format (WIF => PVT_K1_base58privateKey)
        return { private: ecc.PrivateKey(key).toString() };
      } catch (e) {
        // normalize format (EOSKey => PUB_K1_base58publicKey)
        return { public: ecc.PublicKey(key).toString() };
      }
      assert(false, 'expecting public or private keys from keyProvider');
    });

    if (!keys.length) {
      throw new Error('missing key, check your keyProvider');
    }

    // simplify default signing #17
    if (keys.length === 1 && keys[0].private) {
      var pvt = keys[0].private;
      return sign(buf, pvt);
    }

    var keyMap = new _map2.default();

    // keys are either public or private keys
    var _iteratorNormalCompletion = true;
    var _didIteratorError = false;
    var _iteratorError = undefined;

    try {
      for (var _iterator = (0, _getIterator3.default)(keys), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
        var key = _step.value;

        var isPrivate = key.private != null;
        var isPublic = key.public != null;

        if (isPrivate) {
          keyMap.set(ecc.privateToPublic(key.private), key.private);
        } else {
          keyMap.set(key.public, null);
        }
      }
    } catch (err) {
      _didIteratorError = true;
      _iteratorError = err;
    } finally {
      try {
        if (!_iteratorNormalCompletion && _iterator.return) {
          _iterator.return();
        }
      } finally {
        if (_didIteratorError) {
          throw _iteratorError;
        }
      }
    }

    var pubkeys = (0, _from2.default)(keyMap.keys());

    return eos.getRequiredKeys(transaction, pubkeys).then(function (_ref2) {
      var required_keys = _ref2.required_keys;

      if (!required_keys.length) {
        throw new Error('missing required keys for ' + (0, _stringify2.default)(transaction));
      }

      var pvts = [],
          missingKeys = [];

      var _iteratorNormalCompletion2 = true;
      var _didIteratorError2 = false;
      var _iteratorError2 = undefined;

      try {
        for (var _iterator2 = (0, _getIterator3.default)(required_keys), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
          var requiredKey = _step2.value;

          // normalize (EOSKey.. => PUB_K1_Key..)
          requiredKey = ecc.PublicKey(requiredKey).toString();

          var wif = keyMap.get(requiredKey);
          if (wif) {
            pvts.push(wif);
          } else {
            missingKeys.push(requiredKey);
          }
        }
      } catch (err) {
        _didIteratorError2 = true;
        _iteratorError2 = err;
      } finally {
        try {
          if (!_iteratorNormalCompletion2 && _iterator2.return) {
            _iterator2.return();
          }
        } finally {
          if (_didIteratorError2) {
            throw _iteratorError2;
          }
        }
      }

      if (missingKeys.length !== 0) {
        assert(typeof keyProvider === 'function', 'keyProvider function is needed for private key lookup');

        // const pubkeys = missingKeys.map(key => ecc.PublicKey(key).toStringLegacy())
        keyProvider({ pubkeys: missingKeys }).forEach(function (pvt) {
          pvts.push(pvt);
        });
      }

      var sigs = [];
      var _iteratorNormalCompletion3 = true;
      var _didIteratorError3 = false;
      var _iteratorError3 = undefined;

      try {
        for (var _iterator3 = (0, _getIterator3.default)(pvts), _step3; !(_iteratorNormalCompletion3 = (_step3 = _iterator3.next()).done); _iteratorNormalCompletion3 = true) {
          var _pvt = _step3.value;

          sigs.push(sign(buf, _pvt));
        }
      } catch (err) {
        _didIteratorError3 = true;
        _iteratorError3 = err;
      } finally {
        try {
          if (!_iteratorNormalCompletion3 && _iterator3.return) {
            _iterator3.return();
          }
        } finally {
          if (_didIteratorError3) {
            throw _iteratorError3;
          }
        }
      }

      return sigs;
    });
  };
};

function checkChainId(network, chainId) {
  network.getInfo({}).then(function (info) {
    if (info.chain_id !== chainId) {
      console.warn('WARN: chainId mismatch, signatures will not match transaction authority. ' + ('expected ' + chainId + ' !== actual ' + info.chain_id));
    }
  }).catch(function (error) {
    console.error(error);
  });
}