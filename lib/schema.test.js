'use strict';

var _stringify = require('babel-runtime/core-js/json/stringify');

var _stringify2 = _interopRequireDefault(_stringify);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/* eslint-env mocha */

var assert = require('assert');
var Fcbuffer = require('fcbuffer');
var schema = require('./schema');

describe('schema', function () {
  it('parses', function () {
    var fcbuffer = Fcbuffer(schema);
    var errors = (0, _stringify2.default)(fcbuffer.errors, null, 4);
    assert.equal(errors, '[]');
  });
});