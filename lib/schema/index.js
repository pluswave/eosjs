'use strict';

var _assign = require('babel-runtime/core-js/object/assign');

var _assign2 = _interopRequireDefault(_assign);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var schema = (0, _assign2.default)({}, require('./chain_types.json'), require('./eosio_system.json'), require('./eosio_token.json'));

module.exports = schema;