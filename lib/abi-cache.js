'use strict';

var _getIterator2 = require('babel-runtime/core-js/get-iterator');

var _getIterator3 = _interopRequireDefault(_getIterator2);

var _promise = require('babel-runtime/core-js/promise');

var _promise2 = _interopRequireDefault(_promise);

var _assign = require('babel-runtime/core-js/object/assign');

var _assign2 = _interopRequireDefault(_assign);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var assert = require('assert');
var Structs = require('./structs');

module.exports = AbiCache;

function AbiCache(network, config) {
  // Help (or "usage") needs {defaults: true}
  config = (0, _assign2.default)({}, { defaults: true }, config);
  var cache = {};

  /**
    @arg {boolean} force false when ABI is immutable.  When force is true, API
    user is still free to cache the contract object returned by eosjs.
  */
  function abiAsync(account) {
    var force = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : true;

    assert(account, 'required account');

    if (force == false && cache[account] != null) {
      return _promise2.default.resolve(cache[account]);
    }
    return network.getCode(account).then(function (_ref) {
      var abi = _ref.abi;

      assert(abi, 'Missing ABI for account: ' + account);
      var schema = abiToFcSchema(abi);
      var structs = Structs(config, schema); // structs = {structs, types}
      return cache[account] = (0, _assign2.default)({ abi: abi, schema: schema }, structs);
    });
  }

  function abi(account) {
    var c = cache[account];
    if (c == null) {
      throw new Error('Abi \'' + account + '\' is not cached');
    }
    return c;
  }

  return {
    abiAsync: abiAsync,
    abi: abi
  };
}

function abiToFcSchema(abi) {
  // customTypes
  // For FcBuffer
  var abiSchema = {};

  // convert abi types to Fcbuffer schema
  if (abi.types) {
    // aliases
    abi.types.forEach(function (e) {
      abiSchema[e.new_type_name] = e.type;
    });
  }

  if (abi.structs) {
    abi.structs.forEach(function (e) {
      var fields = {};
      var _iteratorNormalCompletion = true;
      var _didIteratorError = false;
      var _iteratorError = undefined;

      try {
        for (var _iterator = (0, _getIterator3.default)(e.fields), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
          var field = _step.value;

          fields[field.name] = field.type;
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

      abiSchema[e.name] = { base: e.base, fields: fields };
      if (e.base === '') {
        delete abiSchema[e.name].base;
      }
    });
  }

  return abiSchema;
}