require=(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
module.exports = require("./src/IO.js");

},{"./src/IO.js":113}],2:[function(require,module,exports){

},{}],3:[function(require,module,exports){
/*!
 * The buffer module from node.js, for the browser.
 *
 * @author   Feross Aboukhadijeh <feross@feross.org> <http://feross.org>
 * @license  MIT
 */

var base64 = require('base64-js')
var ieee754 = require('ieee754')

exports.Buffer = Buffer
exports.SlowBuffer = Buffer
exports.INSPECT_MAX_BYTES = 50
Buffer.poolSize = 8192

/**
 * If `Buffer._useTypedArrays`:
 *   === true    Use Uint8Array implementation (fastest)
 *   === false   Use Object implementation (compatible down to IE6)
 */
Buffer._useTypedArrays = (function () {
  // Detect if browser supports Typed Arrays. Supported browsers are IE 10+, Firefox 4+,
  // Chrome 7+, Safari 5.1+, Opera 11.6+, iOS 4.2+. If the browser does not support adding
  // properties to `Uint8Array` instances, then that's the same as no `Uint8Array` support
  // because we need to be able to add all the node Buffer API methods. This is an issue
  // in Firefox 4-29. Now fixed: https://bugzilla.mozilla.org/show_bug.cgi?id=695438
  try {
    var buf = new ArrayBuffer(0)
    var arr = new Uint8Array(buf)
    arr.foo = function () { return 42 }
    return 42 === arr.foo() &&
        typeof arr.subarray === 'function' // Chrome 9-10 lack `subarray`
  } catch (e) {
    return false
  }
})()

/**
 * Class: Buffer
 * =============
 *
 * The Buffer constructor returns instances of `Uint8Array` that are augmented
 * with function properties for all the node `Buffer` API functions. We use
 * `Uint8Array` so that square bracket notation works as expected -- it returns
 * a single octet.
 *
 * By augmenting the instances, we can avoid modifying the `Uint8Array`
 * prototype.
 */
function Buffer (subject, encoding, noZero) {
  if (!(this instanceof Buffer))
    return new Buffer(subject, encoding, noZero)

  var type = typeof subject

  // Workaround: node's base64 implementation allows for non-padded strings
  // while base64-js does not.
  if (encoding === 'base64' && type === 'string') {
    subject = stringtrim(subject)
    while (subject.length % 4 !== 0) {
      subject = subject + '='
    }
  }

  // Find the length
  var length
  if (type === 'number')
    length = coerce(subject)
  else if (type === 'string')
    length = Buffer.byteLength(subject, encoding)
  else if (type === 'object')
    length = coerce(subject.length) // assume that object is array-like
  else
    throw new Error('First argument needs to be a number, array or string.')

  var buf
  if (Buffer._useTypedArrays) {
    // Preferred: Return an augmented `Uint8Array` instance for best performance
    buf = Buffer._augment(new Uint8Array(length))
  } else {
    // Fallback: Return THIS instance of Buffer (created by `new`)
    buf = this
    buf.length = length
    buf._isBuffer = true
  }

  var i
  if (Buffer._useTypedArrays && typeof subject.byteLength === 'number') {
    // Speed optimization -- use set if we're copying from a typed array
    buf._set(subject)
  } else if (isArrayish(subject)) {
    // Treat array-ish objects as a byte array
    for (i = 0; i < length; i++) {
      if (Buffer.isBuffer(subject))
        buf[i] = subject.readUInt8(i)
      else
        buf[i] = subject[i]
    }
  } else if (type === 'string') {
    buf.write(subject, 0, encoding)
  } else if (type === 'number' && !Buffer._useTypedArrays && !noZero) {
    for (i = 0; i < length; i++) {
      buf[i] = 0
    }
  }

  return buf
}

// STATIC METHODS
// ==============

Buffer.isEncoding = function (encoding) {
  switch (String(encoding).toLowerCase()) {
    case 'hex':
    case 'utf8':
    case 'utf-8':
    case 'ascii':
    case 'binary':
    case 'base64':
    case 'raw':
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      return true
    default:
      return false
  }
}

Buffer.isBuffer = function (b) {
  return !!(b !== null && b !== undefined && b._isBuffer)
}

Buffer.byteLength = function (str, encoding) {
  var ret
  str = str + ''
  switch (encoding || 'utf8') {
    case 'hex':
      ret = str.length / 2
      break
    case 'utf8':
    case 'utf-8':
      ret = utf8ToBytes(str).length
      break
    case 'ascii':
    case 'binary':
    case 'raw':
      ret = str.length
      break
    case 'base64':
      ret = base64ToBytes(str).length
      break
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      ret = str.length * 2
      break
    default:
      throw new Error('Unknown encoding')
  }
  return ret
}

Buffer.concat = function (list, totalLength) {
  assert(isArray(list), 'Usage: Buffer.concat(list, [totalLength])\n' +
      'list should be an Array.')

  if (list.length === 0) {
    return new Buffer(0)
  } else if (list.length === 1) {
    return list[0]
  }

  var i
  if (typeof totalLength !== 'number') {
    totalLength = 0
    for (i = 0; i < list.length; i++) {
      totalLength += list[i].length
    }
  }

  var buf = new Buffer(totalLength)
  var pos = 0
  for (i = 0; i < list.length; i++) {
    var item = list[i]
    item.copy(buf, pos)
    pos += item.length
  }
  return buf
}

// BUFFER INSTANCE METHODS
// =======================

function _hexWrite (buf, string, offset, length) {
  offset = Number(offset) || 0
  var remaining = buf.length - offset
  if (!length) {
    length = remaining
  } else {
    length = Number(length)
    if (length > remaining) {
      length = remaining
    }
  }

  // must be an even number of digits
  var strLen = string.length
  assert(strLen % 2 === 0, 'Invalid hex string')

  if (length > strLen / 2) {
    length = strLen / 2
  }
  for (var i = 0; i < length; i++) {
    var byte = parseInt(string.substr(i * 2, 2), 16)
    assert(!isNaN(byte), 'Invalid hex string')
    buf[offset + i] = byte
  }
  Buffer._charsWritten = i * 2
  return i
}

function _utf8Write (buf, string, offset, length) {
  var charsWritten = Buffer._charsWritten =
    blitBuffer(utf8ToBytes(string), buf, offset, length)
  return charsWritten
}

function _asciiWrite (buf, string, offset, length) {
  var charsWritten = Buffer._charsWritten =
    blitBuffer(asciiToBytes(string), buf, offset, length)
  return charsWritten
}

function _binaryWrite (buf, string, offset, length) {
  return _asciiWrite(buf, string, offset, length)
}

function _base64Write (buf, string, offset, length) {
  var charsWritten = Buffer._charsWritten =
    blitBuffer(base64ToBytes(string), buf, offset, length)
  return charsWritten
}

function _utf16leWrite (buf, string, offset, length) {
  var charsWritten = Buffer._charsWritten =
    blitBuffer(utf16leToBytes(string), buf, offset, length)
  return charsWritten
}

Buffer.prototype.write = function (string, offset, length, encoding) {
  // Support both (string, offset, length, encoding)
  // and the legacy (string, encoding, offset, length)
  if (isFinite(offset)) {
    if (!isFinite(length)) {
      encoding = length
      length = undefined
    }
  } else {  // legacy
    var swap = encoding
    encoding = offset
    offset = length
    length = swap
  }

  offset = Number(offset) || 0
  var remaining = this.length - offset
  if (!length) {
    length = remaining
  } else {
    length = Number(length)
    if (length > remaining) {
      length = remaining
    }
  }
  encoding = String(encoding || 'utf8').toLowerCase()

  var ret
  switch (encoding) {
    case 'hex':
      ret = _hexWrite(this, string, offset, length)
      break
    case 'utf8':
    case 'utf-8':
      ret = _utf8Write(this, string, offset, length)
      break
    case 'ascii':
      ret = _asciiWrite(this, string, offset, length)
      break
    case 'binary':
      ret = _binaryWrite(this, string, offset, length)
      break
    case 'base64':
      ret = _base64Write(this, string, offset, length)
      break
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      ret = _utf16leWrite(this, string, offset, length)
      break
    default:
      throw new Error('Unknown encoding')
  }
  return ret
}

Buffer.prototype.toString = function (encoding, start, end) {
  var self = this

  encoding = String(encoding || 'utf8').toLowerCase()
  start = Number(start) || 0
  end = (end !== undefined)
    ? Number(end)
    : end = self.length

  // Fastpath empty strings
  if (end === start)
    return ''

  var ret
  switch (encoding) {
    case 'hex':
      ret = _hexSlice(self, start, end)
      break
    case 'utf8':
    case 'utf-8':
      ret = _utf8Slice(self, start, end)
      break
    case 'ascii':
      ret = _asciiSlice(self, start, end)
      break
    case 'binary':
      ret = _binarySlice(self, start, end)
      break
    case 'base64':
      ret = _base64Slice(self, start, end)
      break
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      ret = _utf16leSlice(self, start, end)
      break
    default:
      throw new Error('Unknown encoding')
  }
  return ret
}

Buffer.prototype.toJSON = function () {
  return {
    type: 'Buffer',
    data: Array.prototype.slice.call(this._arr || this, 0)
  }
}

// copy(targetBuffer, targetStart=0, sourceStart=0, sourceEnd=buffer.length)
Buffer.prototype.copy = function (target, target_start, start, end) {
  var source = this

  if (!start) start = 0
  if (!end && end !== 0) end = this.length
  if (!target_start) target_start = 0

  // Copy 0 bytes; we're done
  if (end === start) return
  if (target.length === 0 || source.length === 0) return

  // Fatal error conditions
  assert(end >= start, 'sourceEnd < sourceStart')
  assert(target_start >= 0 && target_start < target.length,
      'targetStart out of bounds')
  assert(start >= 0 && start < source.length, 'sourceStart out of bounds')
  assert(end >= 0 && end <= source.length, 'sourceEnd out of bounds')

  // Are we oob?
  if (end > this.length)
    end = this.length
  if (target.length - target_start < end - start)
    end = target.length - target_start + start

  var len = end - start

  if (len < 100 || !Buffer._useTypedArrays) {
    for (var i = 0; i < len; i++)
      target[i + target_start] = this[i + start]
  } else {
    target._set(this.subarray(start, start + len), target_start)
  }
}

function _base64Slice (buf, start, end) {
  if (start === 0 && end === buf.length) {
    return base64.fromByteArray(buf)
  } else {
    return base64.fromByteArray(buf.slice(start, end))
  }
}

function _utf8Slice (buf, start, end) {
  var res = ''
  var tmp = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; i++) {
    if (buf[i] <= 0x7F) {
      res += decodeUtf8Char(tmp) + String.fromCharCode(buf[i])
      tmp = ''
    } else {
      tmp += '%' + buf[i].toString(16)
    }
  }

  return res + decodeUtf8Char(tmp)
}

function _asciiSlice (buf, start, end) {
  var ret = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; i++)
    ret += String.fromCharCode(buf[i])
  return ret
}

function _binarySlice (buf, start, end) {
  return _asciiSlice(buf, start, end)
}

function _hexSlice (buf, start, end) {
  var len = buf.length

  if (!start || start < 0) start = 0
  if (!end || end < 0 || end > len) end = len

  var out = ''
  for (var i = start; i < end; i++) {
    out += toHex(buf[i])
  }
  return out
}

function _utf16leSlice (buf, start, end) {
  var bytes = buf.slice(start, end)
  var res = ''
  for (var i = 0; i < bytes.length; i += 2) {
    res += String.fromCharCode(bytes[i] + bytes[i+1] * 256)
  }
  return res
}

Buffer.prototype.slice = function (start, end) {
  var len = this.length
  start = clamp(start, len, 0)
  end = clamp(end, len, len)

  if (Buffer._useTypedArrays) {
    return Buffer._augment(this.subarray(start, end))
  } else {
    var sliceLen = end - start
    var newBuf = new Buffer(sliceLen, undefined, true)
    for (var i = 0; i < sliceLen; i++) {
      newBuf[i] = this[i + start]
    }
    return newBuf
  }
}

// `get` will be removed in Node 0.13+
Buffer.prototype.get = function (offset) {
  console.log('.get() is deprecated. Access using array indexes instead.')
  return this.readUInt8(offset)
}

// `set` will be removed in Node 0.13+
Buffer.prototype.set = function (v, offset) {
  console.log('.set() is deprecated. Access using array indexes instead.')
  return this.writeUInt8(v, offset)
}

Buffer.prototype.readUInt8 = function (offset, noAssert) {
  if (!noAssert) {
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset < this.length, 'Trying to read beyond buffer length')
  }

  if (offset >= this.length)
    return

  return this[offset]
}

function _readUInt16 (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 1 < buf.length, 'Trying to read beyond buffer length')
  }

  var len = buf.length
  if (offset >= len)
    return

  var val
  if (littleEndian) {
    val = buf[offset]
    if (offset + 1 < len)
      val |= buf[offset + 1] << 8
  } else {
    val = buf[offset] << 8
    if (offset + 1 < len)
      val |= buf[offset + 1]
  }
  return val
}

Buffer.prototype.readUInt16LE = function (offset, noAssert) {
  return _readUInt16(this, offset, true, noAssert)
}

Buffer.prototype.readUInt16BE = function (offset, noAssert) {
  return _readUInt16(this, offset, false, noAssert)
}

function _readUInt32 (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'Trying to read beyond buffer length')
  }

  var len = buf.length
  if (offset >= len)
    return

  var val
  if (littleEndian) {
    if (offset + 2 < len)
      val = buf[offset + 2] << 16
    if (offset + 1 < len)
      val |= buf[offset + 1] << 8
    val |= buf[offset]
    if (offset + 3 < len)
      val = val + (buf[offset + 3] << 24 >>> 0)
  } else {
    if (offset + 1 < len)
      val = buf[offset + 1] << 16
    if (offset + 2 < len)
      val |= buf[offset + 2] << 8
    if (offset + 3 < len)
      val |= buf[offset + 3]
    val = val + (buf[offset] << 24 >>> 0)
  }
  return val
}

Buffer.prototype.readUInt32LE = function (offset, noAssert) {
  return _readUInt32(this, offset, true, noAssert)
}

Buffer.prototype.readUInt32BE = function (offset, noAssert) {
  return _readUInt32(this, offset, false, noAssert)
}

Buffer.prototype.readInt8 = function (offset, noAssert) {
  if (!noAssert) {
    assert(offset !== undefined && offset !== null,
        'missing offset')
    assert(offset < this.length, 'Trying to read beyond buffer length')
  }

  if (offset >= this.length)
    return

  var neg = this[offset] & 0x80
  if (neg)
    return (0xff - this[offset] + 1) * -1
  else
    return this[offset]
}

function _readInt16 (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 1 < buf.length, 'Trying to read beyond buffer length')
  }

  var len = buf.length
  if (offset >= len)
    return

  var val = _readUInt16(buf, offset, littleEndian, true)
  var neg = val & 0x8000
  if (neg)
    return (0xffff - val + 1) * -1
  else
    return val
}

Buffer.prototype.readInt16LE = function (offset, noAssert) {
  return _readInt16(this, offset, true, noAssert)
}

Buffer.prototype.readInt16BE = function (offset, noAssert) {
  return _readInt16(this, offset, false, noAssert)
}

function _readInt32 (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'Trying to read beyond buffer length')
  }

  var len = buf.length
  if (offset >= len)
    return

  var val = _readUInt32(buf, offset, littleEndian, true)
  var neg = val & 0x80000000
  if (neg)
    return (0xffffffff - val + 1) * -1
  else
    return val
}

Buffer.prototype.readInt32LE = function (offset, noAssert) {
  return _readInt32(this, offset, true, noAssert)
}

Buffer.prototype.readInt32BE = function (offset, noAssert) {
  return _readInt32(this, offset, false, noAssert)
}

function _readFloat (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset + 3 < buf.length, 'Trying to read beyond buffer length')
  }

  return ieee754.read(buf, offset, littleEndian, 23, 4)
}

Buffer.prototype.readFloatLE = function (offset, noAssert) {
  return _readFloat(this, offset, true, noAssert)
}

Buffer.prototype.readFloatBE = function (offset, noAssert) {
  return _readFloat(this, offset, false, noAssert)
}

function _readDouble (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset + 7 < buf.length, 'Trying to read beyond buffer length')
  }

  return ieee754.read(buf, offset, littleEndian, 52, 8)
}

Buffer.prototype.readDoubleLE = function (offset, noAssert) {
  return _readDouble(this, offset, true, noAssert)
}

Buffer.prototype.readDoubleBE = function (offset, noAssert) {
  return _readDouble(this, offset, false, noAssert)
}

Buffer.prototype.writeUInt8 = function (value, offset, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset < this.length, 'trying to write beyond buffer length')
    verifuint(value, 0xff)
  }

  if (offset >= this.length) return

  this[offset] = value
}

function _writeUInt16 (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 1 < buf.length, 'trying to write beyond buffer length')
    verifuint(value, 0xffff)
  }

  var len = buf.length
  if (offset >= len)
    return

  for (var i = 0, j = Math.min(len - offset, 2); i < j; i++) {
    buf[offset + i] =
        (value & (0xff << (8 * (littleEndian ? i : 1 - i)))) >>>
            (littleEndian ? i : 1 - i) * 8
  }
}

Buffer.prototype.writeUInt16LE = function (value, offset, noAssert) {
  _writeUInt16(this, value, offset, true, noAssert)
}

Buffer.prototype.writeUInt16BE = function (value, offset, noAssert) {
  _writeUInt16(this, value, offset, false, noAssert)
}

function _writeUInt32 (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'trying to write beyond buffer length')
    verifuint(value, 0xffffffff)
  }

  var len = buf.length
  if (offset >= len)
    return

  for (var i = 0, j = Math.min(len - offset, 4); i < j; i++) {
    buf[offset + i] =
        (value >>> (littleEndian ? i : 3 - i) * 8) & 0xff
  }
}

Buffer.prototype.writeUInt32LE = function (value, offset, noAssert) {
  _writeUInt32(this, value, offset, true, noAssert)
}

Buffer.prototype.writeUInt32BE = function (value, offset, noAssert) {
  _writeUInt32(this, value, offset, false, noAssert)
}

Buffer.prototype.writeInt8 = function (value, offset, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset < this.length, 'Trying to write beyond buffer length')
    verifsint(value, 0x7f, -0x80)
  }

  if (offset >= this.length)
    return

  if (value >= 0)
    this.writeUInt8(value, offset, noAssert)
  else
    this.writeUInt8(0xff + value + 1, offset, noAssert)
}

function _writeInt16 (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 1 < buf.length, 'Trying to write beyond buffer length')
    verifsint(value, 0x7fff, -0x8000)
  }

  var len = buf.length
  if (offset >= len)
    return

  if (value >= 0)
    _writeUInt16(buf, value, offset, littleEndian, noAssert)
  else
    _writeUInt16(buf, 0xffff + value + 1, offset, littleEndian, noAssert)
}

Buffer.prototype.writeInt16LE = function (value, offset, noAssert) {
  _writeInt16(this, value, offset, true, noAssert)
}

Buffer.prototype.writeInt16BE = function (value, offset, noAssert) {
  _writeInt16(this, value, offset, false, noAssert)
}

function _writeInt32 (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'Trying to write beyond buffer length')
    verifsint(value, 0x7fffffff, -0x80000000)
  }

  var len = buf.length
  if (offset >= len)
    return

  if (value >= 0)
    _writeUInt32(buf, value, offset, littleEndian, noAssert)
  else
    _writeUInt32(buf, 0xffffffff + value + 1, offset, littleEndian, noAssert)
}

Buffer.prototype.writeInt32LE = function (value, offset, noAssert) {
  _writeInt32(this, value, offset, true, noAssert)
}

Buffer.prototype.writeInt32BE = function (value, offset, noAssert) {
  _writeInt32(this, value, offset, false, noAssert)
}

function _writeFloat (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'Trying to write beyond buffer length')
    verifIEEE754(value, 3.4028234663852886e+38, -3.4028234663852886e+38)
  }

  var len = buf.length
  if (offset >= len)
    return

  ieee754.write(buf, value, offset, littleEndian, 23, 4)
}

Buffer.prototype.writeFloatLE = function (value, offset, noAssert) {
  _writeFloat(this, value, offset, true, noAssert)
}

Buffer.prototype.writeFloatBE = function (value, offset, noAssert) {
  _writeFloat(this, value, offset, false, noAssert)
}

function _writeDouble (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 7 < buf.length,
        'Trying to write beyond buffer length')
    verifIEEE754(value, 1.7976931348623157E+308, -1.7976931348623157E+308)
  }

  var len = buf.length
  if (offset >= len)
    return

  ieee754.write(buf, value, offset, littleEndian, 52, 8)
}

Buffer.prototype.writeDoubleLE = function (value, offset, noAssert) {
  _writeDouble(this, value, offset, true, noAssert)
}

Buffer.prototype.writeDoubleBE = function (value, offset, noAssert) {
  _writeDouble(this, value, offset, false, noAssert)
}

// fill(value, start=0, end=buffer.length)
Buffer.prototype.fill = function (value, start, end) {
  if (!value) value = 0
  if (!start) start = 0
  if (!end) end = this.length

  if (typeof value === 'string') {
    value = value.charCodeAt(0)
  }

  assert(typeof value === 'number' && !isNaN(value), 'value is not a number')
  assert(end >= start, 'end < start')

  // Fill 0 bytes; we're done
  if (end === start) return
  if (this.length === 0) return

  assert(start >= 0 && start < this.length, 'start out of bounds')
  assert(end >= 0 && end <= this.length, 'end out of bounds')

  for (var i = start; i < end; i++) {
    this[i] = value
  }
}

Buffer.prototype.inspect = function () {
  var out = []
  var len = this.length
  for (var i = 0; i < len; i++) {
    out[i] = toHex(this[i])
    if (i === exports.INSPECT_MAX_BYTES) {
      out[i + 1] = '...'
      break
    }
  }
  return '<Buffer ' + out.join(' ') + '>'
}

/**
 * Creates a new `ArrayBuffer` with the *copied* memory of the buffer instance.
 * Added in Node 0.12. Only available in browsers that support ArrayBuffer.
 */
Buffer.prototype.toArrayBuffer = function () {
  if (typeof Uint8Array !== 'undefined') {
    if (Buffer._useTypedArrays) {
      return (new Buffer(this)).buffer
    } else {
      var buf = new Uint8Array(this.length)
      for (var i = 0, len = buf.length; i < len; i += 1)
        buf[i] = this[i]
      return buf.buffer
    }
  } else {
    throw new Error('Buffer.toArrayBuffer not supported in this browser')
  }
}

// HELPER FUNCTIONS
// ================

function stringtrim (str) {
  if (str.trim) return str.trim()
  return str.replace(/^\s+|\s+$/g, '')
}

var BP = Buffer.prototype

/**
 * Augment a Uint8Array *instance* (not the Uint8Array class!) with Buffer methods
 */
Buffer._augment = function (arr) {
  arr._isBuffer = true

  // save reference to original Uint8Array get/set methods before overwriting
  arr._get = arr.get
  arr._set = arr.set

  // deprecated, will be removed in node 0.13+
  arr.get = BP.get
  arr.set = BP.set

  arr.write = BP.write
  arr.toString = BP.toString
  arr.toLocaleString = BP.toString
  arr.toJSON = BP.toJSON
  arr.copy = BP.copy
  arr.slice = BP.slice
  arr.readUInt8 = BP.readUInt8
  arr.readUInt16LE = BP.readUInt16LE
  arr.readUInt16BE = BP.readUInt16BE
  arr.readUInt32LE = BP.readUInt32LE
  arr.readUInt32BE = BP.readUInt32BE
  arr.readInt8 = BP.readInt8
  arr.readInt16LE = BP.readInt16LE
  arr.readInt16BE = BP.readInt16BE
  arr.readInt32LE = BP.readInt32LE
  arr.readInt32BE = BP.readInt32BE
  arr.readFloatLE = BP.readFloatLE
  arr.readFloatBE = BP.readFloatBE
  arr.readDoubleLE = BP.readDoubleLE
  arr.readDoubleBE = BP.readDoubleBE
  arr.writeUInt8 = BP.writeUInt8
  arr.writeUInt16LE = BP.writeUInt16LE
  arr.writeUInt16BE = BP.writeUInt16BE
  arr.writeUInt32LE = BP.writeUInt32LE
  arr.writeUInt32BE = BP.writeUInt32BE
  arr.writeInt8 = BP.writeInt8
  arr.writeInt16LE = BP.writeInt16LE
  arr.writeInt16BE = BP.writeInt16BE
  arr.writeInt32LE = BP.writeInt32LE
  arr.writeInt32BE = BP.writeInt32BE
  arr.writeFloatLE = BP.writeFloatLE
  arr.writeFloatBE = BP.writeFloatBE
  arr.writeDoubleLE = BP.writeDoubleLE
  arr.writeDoubleBE = BP.writeDoubleBE
  arr.fill = BP.fill
  arr.inspect = BP.inspect
  arr.toArrayBuffer = BP.toArrayBuffer

  return arr
}

// slice(start, end)
function clamp (index, len, defaultValue) {
  if (typeof index !== 'number') return defaultValue
  index = ~~index;  // Coerce to integer.
  if (index >= len) return len
  if (index >= 0) return index
  index += len
  if (index >= 0) return index
  return 0
}

function coerce (length) {
  // Coerce length to a number (possibly NaN), round up
  // in case it's fractional (e.g. 123.456) then do a
  // double negate to coerce a NaN to 0. Easy, right?
  length = ~~Math.ceil(+length)
  return length < 0 ? 0 : length
}

function isArray (subject) {
  return (Array.isArray || function (subject) {
    return Object.prototype.toString.call(subject) === '[object Array]'
  })(subject)
}

function isArrayish (subject) {
  return isArray(subject) || Buffer.isBuffer(subject) ||
      subject && typeof subject === 'object' &&
      typeof subject.length === 'number'
}

function toHex (n) {
  if (n < 16) return '0' + n.toString(16)
  return n.toString(16)
}

function utf8ToBytes (str) {
  var byteArray = []
  for (var i = 0; i < str.length; i++) {
    var b = str.charCodeAt(i)
    if (b <= 0x7F)
      byteArray.push(str.charCodeAt(i))
    else {
      var start = i
      if (b >= 0xD800 && b <= 0xDFFF) i++
      var h = encodeURIComponent(str.slice(start, i+1)).substr(1).split('%')
      for (var j = 0; j < h.length; j++)
        byteArray.push(parseInt(h[j], 16))
    }
  }
  return byteArray
}

function asciiToBytes (str) {
  var byteArray = []
  for (var i = 0; i < str.length; i++) {
    // Node's code seems to be doing this and not & 0x7F..
    byteArray.push(str.charCodeAt(i) & 0xFF)
  }
  return byteArray
}

function utf16leToBytes (str) {
  var c, hi, lo
  var byteArray = []
  for (var i = 0; i < str.length; i++) {
    c = str.charCodeAt(i)
    hi = c >> 8
    lo = c % 256
    byteArray.push(lo)
    byteArray.push(hi)
  }

  return byteArray
}

function base64ToBytes (str) {
  return base64.toByteArray(str)
}

function blitBuffer (src, dst, offset, length) {
  var pos
  for (var i = 0; i < length; i++) {
    if ((i + offset >= dst.length) || (i >= src.length))
      break
    dst[i + offset] = src[i]
  }
  return i
}

function decodeUtf8Char (str) {
  try {
    return decodeURIComponent(str)
  } catch (err) {
    return String.fromCharCode(0xFFFD) // UTF 8 invalid char
  }
}

/*
 * We have to make sure that the value is a valid integer. This means that it
 * is non-negative. It has no fractional component and that it does not
 * exceed the maximum allowed value.
 */
function verifuint (value, max) {
  assert(typeof value === 'number', 'cannot write a non-number as a number')
  assert(value >= 0, 'specified a negative value for writing an unsigned value')
  assert(value <= max, 'value is larger than maximum value for type')
  assert(Math.floor(value) === value, 'value has a fractional component')
}

function verifsint (value, max, min) {
  assert(typeof value === 'number', 'cannot write a non-number as a number')
  assert(value <= max, 'value larger than maximum allowed value')
  assert(value >= min, 'value smaller than minimum allowed value')
  assert(Math.floor(value) === value, 'value has a fractional component')
}

function verifIEEE754 (value, max, min) {
  assert(typeof value === 'number', 'cannot write a non-number as a number')
  assert(value <= max, 'value larger than maximum allowed value')
  assert(value >= min, 'value smaller than minimum allowed value')
}

function assert (test, message) {
  if (!test) throw new Error(message || 'Failed assertion')
}

},{"base64-js":4,"ieee754":5}],4:[function(require,module,exports){
var lookup = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

;(function (exports) {
	'use strict';

  var Arr = (typeof Uint8Array !== 'undefined')
    ? Uint8Array
    : Array

	var PLUS   = '+'.charCodeAt(0)
	var SLASH  = '/'.charCodeAt(0)
	var NUMBER = '0'.charCodeAt(0)
	var LOWER  = 'a'.charCodeAt(0)
	var UPPER  = 'A'.charCodeAt(0)

	function decode (elt) {
		var code = elt.charCodeAt(0)
		if (code === PLUS)
			return 62 // '+'
		if (code === SLASH)
			return 63 // '/'
		if (code < NUMBER)
			return -1 //no match
		if (code < NUMBER + 10)
			return code - NUMBER + 26 + 26
		if (code < UPPER + 26)
			return code - UPPER
		if (code < LOWER + 26)
			return code - LOWER + 26
	}

	function b64ToByteArray (b64) {
		var i, j, l, tmp, placeHolders, arr

		if (b64.length % 4 > 0) {
			throw new Error('Invalid string. Length must be a multiple of 4')
		}

		// the number of equal signs (place holders)
		// if there are two placeholders, than the two characters before it
		// represent one byte
		// if there is only one, then the three characters before it represent 2 bytes
		// this is just a cheap hack to not do indexOf twice
		var len = b64.length
		placeHolders = '=' === b64.charAt(len - 2) ? 2 : '=' === b64.charAt(len - 1) ? 1 : 0

		// base64 is 4/3 + up to two characters of the original data
		arr = new Arr(b64.length * 3 / 4 - placeHolders)

		// if there are placeholders, only get up to the last complete 4 chars
		l = placeHolders > 0 ? b64.length - 4 : b64.length

		var L = 0

		function push (v) {
			arr[L++] = v
		}

		for (i = 0, j = 0; i < l; i += 4, j += 3) {
			tmp = (decode(b64.charAt(i)) << 18) | (decode(b64.charAt(i + 1)) << 12) | (decode(b64.charAt(i + 2)) << 6) | decode(b64.charAt(i + 3))
			push((tmp & 0xFF0000) >> 16)
			push((tmp & 0xFF00) >> 8)
			push(tmp & 0xFF)
		}

		if (placeHolders === 2) {
			tmp = (decode(b64.charAt(i)) << 2) | (decode(b64.charAt(i + 1)) >> 4)
			push(tmp & 0xFF)
		} else if (placeHolders === 1) {
			tmp = (decode(b64.charAt(i)) << 10) | (decode(b64.charAt(i + 1)) << 4) | (decode(b64.charAt(i + 2)) >> 2)
			push((tmp >> 8) & 0xFF)
			push(tmp & 0xFF)
		}

		return arr
	}

	function uint8ToBase64 (uint8) {
		var i,
			extraBytes = uint8.length % 3, // if we have 1 byte left, pad 2 bytes
			output = "",
			temp, length

		function encode (num) {
			return lookup.charAt(num)
		}

		function tripletToBase64 (num) {
			return encode(num >> 18 & 0x3F) + encode(num >> 12 & 0x3F) + encode(num >> 6 & 0x3F) + encode(num & 0x3F)
		}

		// go through the array every three bytes, we'll deal with trailing stuff later
		for (i = 0, length = uint8.length - extraBytes; i < length; i += 3) {
			temp = (uint8[i] << 16) + (uint8[i + 1] << 8) + (uint8[i + 2])
			output += tripletToBase64(temp)
		}

		// pad the end with zeros, but make sure to not forget the extra bytes
		switch (extraBytes) {
			case 1:
				temp = uint8[uint8.length - 1]
				output += encode(temp >> 2)
				output += encode((temp << 4) & 0x3F)
				output += '=='
				break
			case 2:
				temp = (uint8[uint8.length - 2] << 8) + (uint8[uint8.length - 1])
				output += encode(temp >> 10)
				output += encode((temp >> 4) & 0x3F)
				output += encode((temp << 2) & 0x3F)
				output += '='
				break
		}

		return output
	}

	exports.toByteArray = b64ToByteArray
	exports.fromByteArray = uint8ToBase64
}(typeof exports === 'undefined' ? (this.base64js = {}) : exports))

},{}],5:[function(require,module,exports){
exports.read = function(buffer, offset, isLE, mLen, nBytes) {
  var e, m,
      eLen = nBytes * 8 - mLen - 1,
      eMax = (1 << eLen) - 1,
      eBias = eMax >> 1,
      nBits = -7,
      i = isLE ? (nBytes - 1) : 0,
      d = isLE ? -1 : 1,
      s = buffer[offset + i];

  i += d;

  e = s & ((1 << (-nBits)) - 1);
  s >>= (-nBits);
  nBits += eLen;
  for (; nBits > 0; e = e * 256 + buffer[offset + i], i += d, nBits -= 8);

  m = e & ((1 << (-nBits)) - 1);
  e >>= (-nBits);
  nBits += mLen;
  for (; nBits > 0; m = m * 256 + buffer[offset + i], i += d, nBits -= 8);

  if (e === 0) {
    e = 1 - eBias;
  } else if (e === eMax) {
    return m ? NaN : ((s ? -1 : 1) * Infinity);
  } else {
    m = m + Math.pow(2, mLen);
    e = e - eBias;
  }
  return (s ? -1 : 1) * m * Math.pow(2, e - mLen);
};

exports.write = function(buffer, value, offset, isLE, mLen, nBytes) {
  var e, m, c,
      eLen = nBytes * 8 - mLen - 1,
      eMax = (1 << eLen) - 1,
      eBias = eMax >> 1,
      rt = (mLen === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0),
      i = isLE ? 0 : (nBytes - 1),
      d = isLE ? 1 : -1,
      s = value < 0 || (value === 0 && 1 / value < 0) ? 1 : 0;

  value = Math.abs(value);

  if (isNaN(value) || value === Infinity) {
    m = isNaN(value) ? 1 : 0;
    e = eMax;
  } else {
    e = Math.floor(Math.log(value) / Math.LN2);
    if (value * (c = Math.pow(2, -e)) < 1) {
      e--;
      c *= 2;
    }
    if (e + eBias >= 1) {
      value += rt / c;
    } else {
      value += rt * Math.pow(2, 1 - eBias);
    }
    if (value * c >= 2) {
      e++;
      c /= 2;
    }

    if (e + eBias >= eMax) {
      m = 0;
      e = eMax;
    } else if (e + eBias >= 1) {
      m = (value * c - 1) * Math.pow(2, mLen);
      e = e + eBias;
    } else {
      m = value * Math.pow(2, eBias - 1) * Math.pow(2, mLen);
      e = 0;
    }
  }

  for (; mLen >= 8; buffer[offset + i] = m & 0xff, i += d, m /= 256, mLen -= 8);

  e = (e << mLen) | m;
  eLen += mLen;
  for (; eLen > 0; buffer[offset + i] = e & 0xff, i += d, e /= 256, eLen -= 8);

  buffer[offset + i - d] |= s * 128;
};

},{}],6:[function(require,module,exports){
var Buffer = require('buffer').Buffer;
var intSize = 4;
var zeroBuffer = new Buffer(intSize); zeroBuffer.fill(0);
var chrsz = 8;

function toArray(buf, bigEndian) {
  if ((buf.length % intSize) !== 0) {
    var len = buf.length + (intSize - (buf.length % intSize));
    buf = Buffer.concat([buf, zeroBuffer], len);
  }

  var arr = [];
  var fn = bigEndian ? buf.readInt32BE : buf.readInt32LE;
  for (var i = 0; i < buf.length; i += intSize) {
    arr.push(fn.call(buf, i));
  }
  return arr;
}

function toBuffer(arr, size, bigEndian) {
  var buf = new Buffer(size);
  var fn = bigEndian ? buf.writeInt32BE : buf.writeInt32LE;
  for (var i = 0; i < arr.length; i++) {
    fn.call(buf, arr[i], i * 4, true);
  }
  return buf;
}

function hash(buf, fn, hashSize, bigEndian) {
  if (!Buffer.isBuffer(buf)) buf = new Buffer(buf);
  var arr = fn(toArray(buf, bigEndian), buf.length * chrsz);
  return toBuffer(arr, hashSize, bigEndian);
}

module.exports = { hash: hash };

},{"buffer":3}],7:[function(require,module,exports){
var Buffer = require('buffer').Buffer
var sha = require('./sha')
var sha256 = require('./sha256')
var rng = require('./rng')
var md5 = require('./md5')

var algorithms = {
  sha1: sha,
  sha256: sha256,
  md5: md5
}

var blocksize = 64
var zeroBuffer = new Buffer(blocksize); zeroBuffer.fill(0)
function hmac(fn, key, data) {
  if(!Buffer.isBuffer(key)) key = new Buffer(key)
  if(!Buffer.isBuffer(data)) data = new Buffer(data)

  if(key.length > blocksize) {
    key = fn(key)
  } else if(key.length < blocksize) {
    key = Buffer.concat([key, zeroBuffer], blocksize)
  }

  var ipad = new Buffer(blocksize), opad = new Buffer(blocksize)
  for(var i = 0; i < blocksize; i++) {
    ipad[i] = key[i] ^ 0x36
    opad[i] = key[i] ^ 0x5C
  }

  var hash = fn(Buffer.concat([ipad, data]))
  return fn(Buffer.concat([opad, hash]))
}

function hash(alg, key) {
  alg = alg || 'sha1'
  var fn = algorithms[alg]
  var bufs = []
  var length = 0
  if(!fn) error('algorithm:', alg, 'is not yet supported')
  return {
    update: function (data) {
      if(!Buffer.isBuffer(data)) data = new Buffer(data)
        
      bufs.push(data)
      length += data.length
      return this
    },
    digest: function (enc) {
      var buf = Buffer.concat(bufs)
      var r = key ? hmac(fn, key, buf) : fn(buf)
      bufs = null
      return enc ? r.toString(enc) : r
    }
  }
}

function error () {
  var m = [].slice.call(arguments).join(' ')
  throw new Error([
    m,
    'we accept pull requests',
    'http://github.com/dominictarr/crypto-browserify'
    ].join('\n'))
}

exports.createHash = function (alg) { return hash(alg) }
exports.createHmac = function (alg, key) { return hash(alg, key) }
exports.randomBytes = function(size, callback) {
  if (callback && callback.call) {
    try {
      callback.call(this, undefined, new Buffer(rng(size)))
    } catch (err) { callback(err) }
  } else {
    return new Buffer(rng(size))
  }
}

function each(a, f) {
  for(var i in a)
    f(a[i], i)
}

// the least I can do is make error messages for the rest of the node.js/crypto api.
each(['createCredentials'
, 'createCipher'
, 'createCipheriv'
, 'createDecipher'
, 'createDecipheriv'
, 'createSign'
, 'createVerify'
, 'createDiffieHellman'
, 'pbkdf2'], function (name) {
  exports[name] = function () {
    error('sorry,', name, 'is not implemented yet')
  }
})

},{"./md5":8,"./rng":9,"./sha":10,"./sha256":11,"buffer":3}],8:[function(require,module,exports){
/*
 * A JavaScript implementation of the RSA Data Security, Inc. MD5 Message
 * Digest Algorithm, as defined in RFC 1321.
 * Version 2.1 Copyright (C) Paul Johnston 1999 - 2002.
 * Other contributors: Greg Holt, Andrew Kepert, Ydnar, Lostinet
 * Distributed under the BSD License
 * See http://pajhome.org.uk/crypt/md5 for more info.
 */

var helpers = require('./helpers');

/*
 * Perform a simple self-test to see if the VM is working
 */
function md5_vm_test()
{
  return hex_md5("abc") == "900150983cd24fb0d6963f7d28e17f72";
}

/*
 * Calculate the MD5 of an array of little-endian words, and a bit length
 */
function core_md5(x, len)
{
  /* append padding */
  x[len >> 5] |= 0x80 << ((len) % 32);
  x[(((len + 64) >>> 9) << 4) + 14] = len;

  var a =  1732584193;
  var b = -271733879;
  var c = -1732584194;
  var d =  271733878;

  for(var i = 0; i < x.length; i += 16)
  {
    var olda = a;
    var oldb = b;
    var oldc = c;
    var oldd = d;

    a = md5_ff(a, b, c, d, x[i+ 0], 7 , -680876936);
    d = md5_ff(d, a, b, c, x[i+ 1], 12, -389564586);
    c = md5_ff(c, d, a, b, x[i+ 2], 17,  606105819);
    b = md5_ff(b, c, d, a, x[i+ 3], 22, -1044525330);
    a = md5_ff(a, b, c, d, x[i+ 4], 7 , -176418897);
    d = md5_ff(d, a, b, c, x[i+ 5], 12,  1200080426);
    c = md5_ff(c, d, a, b, x[i+ 6], 17, -1473231341);
    b = md5_ff(b, c, d, a, x[i+ 7], 22, -45705983);
    a = md5_ff(a, b, c, d, x[i+ 8], 7 ,  1770035416);
    d = md5_ff(d, a, b, c, x[i+ 9], 12, -1958414417);
    c = md5_ff(c, d, a, b, x[i+10], 17, -42063);
    b = md5_ff(b, c, d, a, x[i+11], 22, -1990404162);
    a = md5_ff(a, b, c, d, x[i+12], 7 ,  1804603682);
    d = md5_ff(d, a, b, c, x[i+13], 12, -40341101);
    c = md5_ff(c, d, a, b, x[i+14], 17, -1502002290);
    b = md5_ff(b, c, d, a, x[i+15], 22,  1236535329);

    a = md5_gg(a, b, c, d, x[i+ 1], 5 , -165796510);
    d = md5_gg(d, a, b, c, x[i+ 6], 9 , -1069501632);
    c = md5_gg(c, d, a, b, x[i+11], 14,  643717713);
    b = md5_gg(b, c, d, a, x[i+ 0], 20, -373897302);
    a = md5_gg(a, b, c, d, x[i+ 5], 5 , -701558691);
    d = md5_gg(d, a, b, c, x[i+10], 9 ,  38016083);
    c = md5_gg(c, d, a, b, x[i+15], 14, -660478335);
    b = md5_gg(b, c, d, a, x[i+ 4], 20, -405537848);
    a = md5_gg(a, b, c, d, x[i+ 9], 5 ,  568446438);
    d = md5_gg(d, a, b, c, x[i+14], 9 , -1019803690);
    c = md5_gg(c, d, a, b, x[i+ 3], 14, -187363961);
    b = md5_gg(b, c, d, a, x[i+ 8], 20,  1163531501);
    a = md5_gg(a, b, c, d, x[i+13], 5 , -1444681467);
    d = md5_gg(d, a, b, c, x[i+ 2], 9 , -51403784);
    c = md5_gg(c, d, a, b, x[i+ 7], 14,  1735328473);
    b = md5_gg(b, c, d, a, x[i+12], 20, -1926607734);

    a = md5_hh(a, b, c, d, x[i+ 5], 4 , -378558);
    d = md5_hh(d, a, b, c, x[i+ 8], 11, -2022574463);
    c = md5_hh(c, d, a, b, x[i+11], 16,  1839030562);
    b = md5_hh(b, c, d, a, x[i+14], 23, -35309556);
    a = md5_hh(a, b, c, d, x[i+ 1], 4 , -1530992060);
    d = md5_hh(d, a, b, c, x[i+ 4], 11,  1272893353);
    c = md5_hh(c, d, a, b, x[i+ 7], 16, -155497632);
    b = md5_hh(b, c, d, a, x[i+10], 23, -1094730640);
    a = md5_hh(a, b, c, d, x[i+13], 4 ,  681279174);
    d = md5_hh(d, a, b, c, x[i+ 0], 11, -358537222);
    c = md5_hh(c, d, a, b, x[i+ 3], 16, -722521979);
    b = md5_hh(b, c, d, a, x[i+ 6], 23,  76029189);
    a = md5_hh(a, b, c, d, x[i+ 9], 4 , -640364487);
    d = md5_hh(d, a, b, c, x[i+12], 11, -421815835);
    c = md5_hh(c, d, a, b, x[i+15], 16,  530742520);
    b = md5_hh(b, c, d, a, x[i+ 2], 23, -995338651);

    a = md5_ii(a, b, c, d, x[i+ 0], 6 , -198630844);
    d = md5_ii(d, a, b, c, x[i+ 7], 10,  1126891415);
    c = md5_ii(c, d, a, b, x[i+14], 15, -1416354905);
    b = md5_ii(b, c, d, a, x[i+ 5], 21, -57434055);
    a = md5_ii(a, b, c, d, x[i+12], 6 ,  1700485571);
    d = md5_ii(d, a, b, c, x[i+ 3], 10, -1894986606);
    c = md5_ii(c, d, a, b, x[i+10], 15, -1051523);
    b = md5_ii(b, c, d, a, x[i+ 1], 21, -2054922799);
    a = md5_ii(a, b, c, d, x[i+ 8], 6 ,  1873313359);
    d = md5_ii(d, a, b, c, x[i+15], 10, -30611744);
    c = md5_ii(c, d, a, b, x[i+ 6], 15, -1560198380);
    b = md5_ii(b, c, d, a, x[i+13], 21,  1309151649);
    a = md5_ii(a, b, c, d, x[i+ 4], 6 , -145523070);
    d = md5_ii(d, a, b, c, x[i+11], 10, -1120210379);
    c = md5_ii(c, d, a, b, x[i+ 2], 15,  718787259);
    b = md5_ii(b, c, d, a, x[i+ 9], 21, -343485551);

    a = safe_add(a, olda);
    b = safe_add(b, oldb);
    c = safe_add(c, oldc);
    d = safe_add(d, oldd);
  }
  return Array(a, b, c, d);

}

/*
 * These functions implement the four basic operations the algorithm uses.
 */
function md5_cmn(q, a, b, x, s, t)
{
  return safe_add(bit_rol(safe_add(safe_add(a, q), safe_add(x, t)), s),b);
}
function md5_ff(a, b, c, d, x, s, t)
{
  return md5_cmn((b & c) | ((~b) & d), a, b, x, s, t);
}
function md5_gg(a, b, c, d, x, s, t)
{
  return md5_cmn((b & d) | (c & (~d)), a, b, x, s, t);
}
function md5_hh(a, b, c, d, x, s, t)
{
  return md5_cmn(b ^ c ^ d, a, b, x, s, t);
}
function md5_ii(a, b, c, d, x, s, t)
{
  return md5_cmn(c ^ (b | (~d)), a, b, x, s, t);
}

/*
 * Add integers, wrapping at 2^32. This uses 16-bit operations internally
 * to work around bugs in some JS interpreters.
 */
function safe_add(x, y)
{
  var lsw = (x & 0xFFFF) + (y & 0xFFFF);
  var msw = (x >> 16) + (y >> 16) + (lsw >> 16);
  return (msw << 16) | (lsw & 0xFFFF);
}

/*
 * Bitwise rotate a 32-bit number to the left.
 */
function bit_rol(num, cnt)
{
  return (num << cnt) | (num >>> (32 - cnt));
}

module.exports = function md5(buf) {
  return helpers.hash(buf, core_md5, 16);
};

},{"./helpers":6}],9:[function(require,module,exports){
// Original code adapted from Robert Kieffer.
// details at https://github.com/broofa/node-uuid
(function() {
  var _global = this;

  var mathRNG, whatwgRNG;

  // NOTE: Math.random() does not guarantee "cryptographic quality"
  mathRNG = function(size) {
    var bytes = new Array(size);
    var r;

    for (var i = 0, r; i < size; i++) {
      if ((i & 0x03) == 0) r = Math.random() * 0x100000000;
      bytes[i] = r >>> ((i & 0x03) << 3) & 0xff;
    }

    return bytes;
  }

  if (_global.crypto && crypto.getRandomValues) {
    whatwgRNG = function(size) {
      var bytes = new Uint8Array(size);
      crypto.getRandomValues(bytes);
      return bytes;
    }
  }

  module.exports = whatwgRNG || mathRNG;

}())

},{}],10:[function(require,module,exports){
/*
 * A JavaScript implementation of the Secure Hash Algorithm, SHA-1, as defined
 * in FIPS PUB 180-1
 * Version 2.1a Copyright Paul Johnston 2000 - 2002.
 * Other contributors: Greg Holt, Andrew Kepert, Ydnar, Lostinet
 * Distributed under the BSD License
 * See http://pajhome.org.uk/crypt/md5 for details.
 */

var helpers = require('./helpers');

/*
 * Calculate the SHA-1 of an array of big-endian words, and a bit length
 */
function core_sha1(x, len)
{
  /* append padding */
  x[len >> 5] |= 0x80 << (24 - len % 32);
  x[((len + 64 >> 9) << 4) + 15] = len;

  var w = Array(80);
  var a =  1732584193;
  var b = -271733879;
  var c = -1732584194;
  var d =  271733878;
  var e = -1009589776;

  for(var i = 0; i < x.length; i += 16)
  {
    var olda = a;
    var oldb = b;
    var oldc = c;
    var oldd = d;
    var olde = e;

    for(var j = 0; j < 80; j++)
    {
      if(j < 16) w[j] = x[i + j];
      else w[j] = rol(w[j-3] ^ w[j-8] ^ w[j-14] ^ w[j-16], 1);
      var t = safe_add(safe_add(rol(a, 5), sha1_ft(j, b, c, d)),
                       safe_add(safe_add(e, w[j]), sha1_kt(j)));
      e = d;
      d = c;
      c = rol(b, 30);
      b = a;
      a = t;
    }

    a = safe_add(a, olda);
    b = safe_add(b, oldb);
    c = safe_add(c, oldc);
    d = safe_add(d, oldd);
    e = safe_add(e, olde);
  }
  return Array(a, b, c, d, e);

}

/*
 * Perform the appropriate triplet combination function for the current
 * iteration
 */
function sha1_ft(t, b, c, d)
{
  if(t < 20) return (b & c) | ((~b) & d);
  if(t < 40) return b ^ c ^ d;
  if(t < 60) return (b & c) | (b & d) | (c & d);
  return b ^ c ^ d;
}

/*
 * Determine the appropriate additive constant for the current iteration
 */
function sha1_kt(t)
{
  return (t < 20) ?  1518500249 : (t < 40) ?  1859775393 :
         (t < 60) ? -1894007588 : -899497514;
}

/*
 * Add integers, wrapping at 2^32. This uses 16-bit operations internally
 * to work around bugs in some JS interpreters.
 */
function safe_add(x, y)
{
  var lsw = (x & 0xFFFF) + (y & 0xFFFF);
  var msw = (x >> 16) + (y >> 16) + (lsw >> 16);
  return (msw << 16) | (lsw & 0xFFFF);
}

/*
 * Bitwise rotate a 32-bit number to the left.
 */
function rol(num, cnt)
{
  return (num << cnt) | (num >>> (32 - cnt));
}

module.exports = function sha1(buf) {
  return helpers.hash(buf, core_sha1, 20, true);
};

},{"./helpers":6}],11:[function(require,module,exports){

/**
 * A JavaScript implementation of the Secure Hash Algorithm, SHA-256, as defined
 * in FIPS 180-2
 * Version 2.2-beta Copyright Angel Marin, Paul Johnston 2000 - 2009.
 * Other contributors: Greg Holt, Andrew Kepert, Ydnar, Lostinet
 *
 */

var helpers = require('./helpers');

var safe_add = function(x, y) {
  var lsw = (x & 0xFFFF) + (y & 0xFFFF);
  var msw = (x >> 16) + (y >> 16) + (lsw >> 16);
  return (msw << 16) | (lsw & 0xFFFF);
};

var S = function(X, n) {
  return (X >>> n) | (X << (32 - n));
};

var R = function(X, n) {
  return (X >>> n);
};

var Ch = function(x, y, z) {
  return ((x & y) ^ ((~x) & z));
};

var Maj = function(x, y, z) {
  return ((x & y) ^ (x & z) ^ (y & z));
};

var Sigma0256 = function(x) {
  return (S(x, 2) ^ S(x, 13) ^ S(x, 22));
};

var Sigma1256 = function(x) {
  return (S(x, 6) ^ S(x, 11) ^ S(x, 25));
};

var Gamma0256 = function(x) {
  return (S(x, 7) ^ S(x, 18) ^ R(x, 3));
};

var Gamma1256 = function(x) {
  return (S(x, 17) ^ S(x, 19) ^ R(x, 10));
};

var core_sha256 = function(m, l) {
  var K = new Array(0x428A2F98,0x71374491,0xB5C0FBCF,0xE9B5DBA5,0x3956C25B,0x59F111F1,0x923F82A4,0xAB1C5ED5,0xD807AA98,0x12835B01,0x243185BE,0x550C7DC3,0x72BE5D74,0x80DEB1FE,0x9BDC06A7,0xC19BF174,0xE49B69C1,0xEFBE4786,0xFC19DC6,0x240CA1CC,0x2DE92C6F,0x4A7484AA,0x5CB0A9DC,0x76F988DA,0x983E5152,0xA831C66D,0xB00327C8,0xBF597FC7,0xC6E00BF3,0xD5A79147,0x6CA6351,0x14292967,0x27B70A85,0x2E1B2138,0x4D2C6DFC,0x53380D13,0x650A7354,0x766A0ABB,0x81C2C92E,0x92722C85,0xA2BFE8A1,0xA81A664B,0xC24B8B70,0xC76C51A3,0xD192E819,0xD6990624,0xF40E3585,0x106AA070,0x19A4C116,0x1E376C08,0x2748774C,0x34B0BCB5,0x391C0CB3,0x4ED8AA4A,0x5B9CCA4F,0x682E6FF3,0x748F82EE,0x78A5636F,0x84C87814,0x8CC70208,0x90BEFFFA,0xA4506CEB,0xBEF9A3F7,0xC67178F2);
  var HASH = new Array(0x6A09E667, 0xBB67AE85, 0x3C6EF372, 0xA54FF53A, 0x510E527F, 0x9B05688C, 0x1F83D9AB, 0x5BE0CD19);
    var W = new Array(64);
    var a, b, c, d, e, f, g, h, i, j;
    var T1, T2;
  /* append padding */
  m[l >> 5] |= 0x80 << (24 - l % 32);
  m[((l + 64 >> 9) << 4) + 15] = l;
  for (var i = 0; i < m.length; i += 16) {
    a = HASH[0]; b = HASH[1]; c = HASH[2]; d = HASH[3]; e = HASH[4]; f = HASH[5]; g = HASH[6]; h = HASH[7];
    for (var j = 0; j < 64; j++) {
      if (j < 16) {
        W[j] = m[j + i];
      } else {
        W[j] = safe_add(safe_add(safe_add(Gamma1256(W[j - 2]), W[j - 7]), Gamma0256(W[j - 15])), W[j - 16]);
      }
      T1 = safe_add(safe_add(safe_add(safe_add(h, Sigma1256(e)), Ch(e, f, g)), K[j]), W[j]);
      T2 = safe_add(Sigma0256(a), Maj(a, b, c));
      h = g; g = f; f = e; e = safe_add(d, T1); d = c; c = b; b = a; a = safe_add(T1, T2);
    }
    HASH[0] = safe_add(a, HASH[0]); HASH[1] = safe_add(b, HASH[1]); HASH[2] = safe_add(c, HASH[2]); HASH[3] = safe_add(d, HASH[3]);
    HASH[4] = safe_add(e, HASH[4]); HASH[5] = safe_add(f, HASH[5]); HASH[6] = safe_add(g, HASH[6]); HASH[7] = safe_add(h, HASH[7]);
  }
  return HASH;
};

module.exports = function sha256(buf) {
  return helpers.hash(buf, core_sha256, 32, true);
};

},{"./helpers":6}],12:[function(require,module,exports){
// shim for using process in browser

var process = module.exports = {};

process.nextTick = (function () {
    var canSetImmediate = typeof window !== 'undefined'
    && window.setImmediate;
    var canPost = typeof window !== 'undefined'
    && window.postMessage && window.addEventListener
    ;

    if (canSetImmediate) {
        return function (f) { return window.setImmediate(f) };
    }

    if (canPost) {
        var queue = [];
        window.addEventListener('message', function (ev) {
            var source = ev.source;
            if ((source === window || source === null) && ev.data === 'process-tick') {
                ev.stopPropagation();
                if (queue.length > 0) {
                    var fn = queue.shift();
                    fn();
                }
            }
        }, true);

        return function nextTick(fn) {
            queue.push(fn);
            window.postMessage('process-tick', '*');
        };
    }

    return function nextTick(fn) {
        setTimeout(fn, 0);
    };
})();

process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];

function noop() {}

process.on = noop;
process.once = noop;
process.off = noop;
process.emit = noop;

process.binding = function (name) {
    throw new Error('process.binding is not supported');
}

// TODO(shtylman)
process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};

},{}],13:[function(require,module,exports){
(function (process){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

// resolves . and .. elements in a path array with directory names there
// must be no slashes, empty elements, or device names (c:\) in the array
// (so also no leading and trailing slashes - it does not distinguish
// relative and absolute paths)
function normalizeArray(parts, allowAboveRoot) {
  // if the path tries to go above the root, `up` ends up > 0
  var up = 0;
  for (var i = parts.length - 1; i >= 0; i--) {
    var last = parts[i];
    if (last === '.') {
      parts.splice(i, 1);
    } else if (last === '..') {
      parts.splice(i, 1);
      up++;
    } else if (up) {
      parts.splice(i, 1);
      up--;
    }
  }

  // if the path is allowed to go above the root, restore leading ..s
  if (allowAboveRoot) {
    for (; up--; up) {
      parts.unshift('..');
    }
  }

  return parts;
}

// Split a filename into [root, dir, basename, ext], unix version
// 'root' is just a slash, or nothing.
var splitPathRe =
    /^(\/?|)([\s\S]*?)((?:\.{1,2}|[^\/]+?|)(\.[^.\/]*|))(?:[\/]*)$/;
var splitPath = function(filename) {
  return splitPathRe.exec(filename).slice(1);
};

// path.resolve([from ...], to)
// posix version
exports.resolve = function() {
  var resolvedPath = '',
      resolvedAbsolute = false;

  for (var i = arguments.length - 1; i >= -1 && !resolvedAbsolute; i--) {
    var path = (i >= 0) ? arguments[i] : process.cwd();

    // Skip empty and invalid entries
    if (typeof path !== 'string') {
      throw new TypeError('Arguments to path.resolve must be strings');
    } else if (!path) {
      continue;
    }

    resolvedPath = path + '/' + resolvedPath;
    resolvedAbsolute = path.charAt(0) === '/';
  }

  // At this point the path should be resolved to a full absolute path, but
  // handle relative paths to be safe (might happen when process.cwd() fails)

  // Normalize the path
  resolvedPath = normalizeArray(filter(resolvedPath.split('/'), function(p) {
    return !!p;
  }), !resolvedAbsolute).join('/');

  return ((resolvedAbsolute ? '/' : '') + resolvedPath) || '.';
};

// path.normalize(path)
// posix version
exports.normalize = function(path) {
  var isAbsolute = exports.isAbsolute(path),
      trailingSlash = substr(path, -1) === '/';

  // Normalize the path
  path = normalizeArray(filter(path.split('/'), function(p) {
    return !!p;
  }), !isAbsolute).join('/');

  if (!path && !isAbsolute) {
    path = '.';
  }
  if (path && trailingSlash) {
    path += '/';
  }

  return (isAbsolute ? '/' : '') + path;
};

// posix version
exports.isAbsolute = function(path) {
  return path.charAt(0) === '/';
};

// posix version
exports.join = function() {
  var paths = Array.prototype.slice.call(arguments, 0);
  return exports.normalize(filter(paths, function(p, index) {
    if (typeof p !== 'string') {
      throw new TypeError('Arguments to path.join must be strings');
    }
    return p;
  }).join('/'));
};


// path.relative(from, to)
// posix version
exports.relative = function(from, to) {
  from = exports.resolve(from).substr(1);
  to = exports.resolve(to).substr(1);

  function trim(arr) {
    var start = 0;
    for (; start < arr.length; start++) {
      if (arr[start] !== '') break;
    }

    var end = arr.length - 1;
    for (; end >= 0; end--) {
      if (arr[end] !== '') break;
    }

    if (start > end) return [];
    return arr.slice(start, end - start + 1);
  }

  var fromParts = trim(from.split('/'));
  var toParts = trim(to.split('/'));

  var length = Math.min(fromParts.length, toParts.length);
  var samePartsLength = length;
  for (var i = 0; i < length; i++) {
    if (fromParts[i] !== toParts[i]) {
      samePartsLength = i;
      break;
    }
  }

  var outputParts = [];
  for (var i = samePartsLength; i < fromParts.length; i++) {
    outputParts.push('..');
  }

  outputParts = outputParts.concat(toParts.slice(samePartsLength));

  return outputParts.join('/');
};

exports.sep = '/';
exports.delimiter = ':';

exports.dirname = function(path) {
  var result = splitPath(path),
      root = result[0],
      dir = result[1];

  if (!root && !dir) {
    // No dirname whatsoever
    return '.';
  }

  if (dir) {
    // It has a dirname, strip trailing slash
    dir = dir.substr(0, dir.length - 1);
  }

  return root + dir;
};


exports.basename = function(path, ext) {
  var f = splitPath(path)[2];
  // TODO: make this comparison case-insensitive on windows?
  if (ext && f.substr(-1 * ext.length) === ext) {
    f = f.substr(0, f.length - ext.length);
  }
  return f;
};


exports.extname = function(path) {
  return splitPath(path)[3];
};

function filter (xs, f) {
    if (xs.filter) return xs.filter(f);
    var res = [];
    for (var i = 0; i < xs.length; i++) {
        if (f(xs[i], i, xs)) res.push(xs[i]);
    }
    return res;
}

// String.prototype.substr - negative index don't work in IE8
var substr = 'ab'.substr(-1) === 'b'
    ? function (str, start, len) { return str.substr(start, len) }
    : function (str, start, len) {
        if (start < 0) start = str.length + start;
        return str.substr(start, len);
    }
;

}).call(this,require("/home/ryan/git/ndn-modules/ndn-io/node_modules/browserify/node_modules/insert-module-globals/node_modules/process/browser.js"))
},{"/home/ryan/git/ndn-modules/ndn-io/node_modules/browserify/node_modules/insert-module-globals/node_modules/process/browser.js":12}],14:[function(require,module,exports){
exports.ndn = require("ndn-lib");
exports.NameTree = require("./src/DataStructures/NameTree.js").installNDN(exports.ndn);
exports.PIT = require("./src/DataStructures/PIT.js").installNDN(exports.ndn);
exports.FIB = require("./src/DataStructures/FIB.js").installNDN(exports.ndn);
exports.ContentStore = require("./src/DataStructures/ContentStore.js");
exports.Interfaces = require("./src/DataStructures/Interfaces.js").installNDN(exports.ndn);
exports.Transports = require("./src/Transports/node.js");

module.exports = exports;

},{"./src/DataStructures/ContentStore.js":89,"./src/DataStructures/FIB.js":90,"./src/DataStructures/Interfaces.js":91,"./src/DataStructures/NameTree.js":92,"./src/DataStructures/PIT.js":94,"./src/Transports/node.js":95,"ndn-lib":24}],15:[function(require,module,exports){
/*! asn1hex-1.1.js (c) 2012 Kenji Urushima | kjur.github.com/jsrsasign/license
 */
//
// asn1hex.js - Hexadecimal represented ASN.1 string library
//
// version: 1.1 (09-May-2012)
//
// Copyright (c) 2010-2012 Kenji Urushima (kenji.urushima@gmail.com)
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
// 
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
// 
// This software is licensed under the terms of the MIT License.
// http://kjur.github.com/jsrsasign/license/
//
// Depends on:
//
var BigInteger = require('jsbn')

function parseBigInt(str,r) {
  return new BigInteger(str,r);
}
// MEMO:
//   f('3082025b02...', 2) ... 82025b ... 3bytes
//   f('020100', 2) ... 01 ... 1byte
//   f('0203001...', 2) ... 03 ... 1byte
//   f('02818003...', 2) ... 8180 ... 2bytes
//   f('3080....0000', 2) ... 80 ... -1
//
//   Requirements:
//   - ASN.1 type octet length MUST be 1. 
//     (i.e. ASN.1 primitives like SET, SEQUENCE, INTEGER, OCTETSTRING ...)
//   - 

/**
 * @fileOverview
 * @name asn1hex-1.1.js
 * @author Kenji Urushima kenji.urushima@gmail.com
 * @version 1.1
 * @license <a href="http://kjur.github.io/jsrsasign/license/">MIT License</a>
 */

/**
 * get byte length for ASN.1 L(length) bytes
 * @name getByteLengthOfL_AtObj
 * @memberOf ASN1HEX
 * @function
 * @param {String} s hexadecimal string of ASN.1 DER encoded data
 * @param {Number} pos string index
 * @return byte length for ASN.1 L(length) bytes
 */
function _asnhex_getByteLengthOfL_AtObj(s, pos) {
  if (s.substring(pos + 2, pos + 3) != '8') return 1;
  var i = parseInt(s.substring(pos + 3, pos + 4));
  if (i == 0) return -1; 		// length octet '80' indefinite length
  if (0 < i && i < 10) return i + 1;	// including '8?' octet;
  return -2;				// malformed format
}


/**
 * get hexadecimal string for ASN.1 L(length) bytes
 * @name getHexOfL_AtObj
 * @memberOf ASN1HEX
 * @function
 * @param {String} s hexadecimal string of ASN.1 DER encoded data
 * @param {Number} pos string index
 * @return {String} hexadecimal string for ASN.1 L(length) bytes
 */
function _asnhex_getHexOfL_AtObj(s, pos) {
  var len = _asnhex_getByteLengthOfL_AtObj(s, pos);
  if (len < 1) return '';
  return s.substring(pos + 2, pos + 2 + len * 2);
}

//
//   getting ASN.1 length value at the position 'idx' of
//   hexa decimal string 's'.
//
//   f('3082025b02...', 0) ... 82025b ... ???
//   f('020100', 0) ... 01 ... 1
//   f('0203001...', 0) ... 03 ... 3
//   f('02818003...', 0) ... 8180 ... 128
/**
 * get integer value of ASN.1 length for ASN.1 data
 * @name getIntOfL_AtObj
 * @memberOf ASN1HEX
 * @function
 * @param {String} s hexadecimal string of ASN.1 DER encoded data
 * @param {Number} pos string index
 * @return ASN.1 L(length) integer value
 */
function _asnhex_getIntOfL_AtObj(s, pos) {
  var hLength = _asnhex_getHexOfL_AtObj(s, pos);
  if (hLength == '') return -1;
  var bi;
  if (parseInt(hLength.substring(0, 1)) < 8) {
     bi = parseBigInt(hLength, 16);
  } else {
     bi = parseBigInt(hLength.substring(2), 16);
  }
  return bi.intValue();
}

/**
 * get ASN.1 value starting string position for ASN.1 object refered by index 'idx'.
 * @name getStartPosOfV_AtObj
 * @memberOf ASN1HEX
 * @function
 * @param {String} s hexadecimal string of ASN.1 DER encoded data
 * @param {Number} pos string index
 */
function _asnhex_getStartPosOfV_AtObj(s, pos) {
  var l_len = _asnhex_getByteLengthOfL_AtObj(s, pos);
  if (l_len < 0) return l_len;
  return pos + (l_len + 1) * 2;
}

/**
 * get hexadecimal string of ASN.1 V(value)
 * @name getHexOfV_AtObj
 * @memberOf ASN1HEX
 * @function
 * @param {String} s hexadecimal string of ASN.1 DER encoded data
 * @param {Number} pos string index
 * @return {String} hexadecimal string of ASN.1 value.
 */
function _asnhex_getHexOfV_AtObj(s, pos) {
  var pos1 = _asnhex_getStartPosOfV_AtObj(s, pos);
  var len = _asnhex_getIntOfL_AtObj(s, pos);
  return s.substring(pos1, pos1 + len * 2);
}

/**
 * get hexadecimal string of ASN.1 TLV at
 * @name getHexOfTLV_AtObj
 * @memberOf ASN1HEX
 * @function
 * @param {String} s hexadecimal string of ASN.1 DER encoded data
 * @param {Number} pos string index
 * @return {String} hexadecimal string of ASN.1 TLV.
 * @since 1.1
 */
function _asnhex_getHexOfTLV_AtObj(s, pos) {
  var hT = s.substr(pos, 2);
  var hL = _asnhex_getHexOfL_AtObj(s, pos);
  var hV = _asnhex_getHexOfV_AtObj(s, pos);
  return hT + hL + hV;
}

/**
 * get next sibling starting index for ASN.1 object string
 * @name getPosOfNextSibling_AtObj
 * @memberOf ASN1HEX
 * @function
 * @param {String} s hexadecimal string of ASN.1 DER encoded data
 * @param {Number} pos string index
 * @return next sibling starting index for ASN.1 object string
 */
function _asnhex_getPosOfNextSibling_AtObj(s, pos) {
  var pos1 = _asnhex_getStartPosOfV_AtObj(s, pos);
  var len = _asnhex_getIntOfL_AtObj(s, pos);
  return pos1 + len * 2;
}

/**
 * get array of indexes of child ASN.1 objects
 * @name getPosArrayOfChildren_AtObj
 * @memberOf ASN1HEX
 * @function
 * @param {String} s hexadecimal string of ASN.1 DER encoded data
 * @param {Number} start string index of ASN.1 object
 * @return {Array of Number} array of indexes for childen of ASN.1 objects
 */
function _asnhex_getPosArrayOfChildren_AtObj(h, pos) {
  var a = new Array();
  var p0 = _asnhex_getStartPosOfV_AtObj(h, pos);
  a.push(p0);

  var len = _asnhex_getIntOfL_AtObj(h, pos);
  var p = p0;
  var k = 0;
  while (1) {
    var pNext = _asnhex_getPosOfNextSibling_AtObj(h, p);
    if (pNext == null || (pNext - p0  >= (len * 2))) break;
    if (k >= 200) break;

    a.push(pNext);
    p = pNext;

    k++;
  }

  return a;
}

/**
 * get string index of nth child object of ASN.1 object refered by h, idx
 * @name getNthChildIndex_AtObj
 * @memberOf ASN1HEX
 * @function
 * @param {String} h hexadecimal string of ASN.1 DER encoded data
 * @param {Number} idx start string index of ASN.1 object
 * @param {Number} nth for child
 * @return {Number} string index of nth child.
 * @since 1.1
 */
function _asnhex_getNthChildIndex_AtObj(h, idx, nth) {
  var a = _asnhex_getPosArrayOfChildren_AtObj(h, idx);
  return a[nth];
}

// ========== decendant methods ==============================

/**
 * get string index of nth child object of ASN.1 object refered by h, idx
 * @name getDecendantIndexByNthList
 * @memberOf ASN1HEX
 * @function
 * @param {String} h hexadecimal string of ASN.1 DER encoded data
 * @param {Number} currentIndex start string index of ASN.1 object
 * @param {Array of Number} nthList array list of nth
 * @return {Number} string index refered by nthList
 * @since 1.1
 */
function _asnhex_getDecendantIndexByNthList(h, currentIndex, nthList) {
  if (nthList.length == 0) {
    return currentIndex;
  }
  var firstNth = nthList.shift();
  var a = _asnhex_getPosArrayOfChildren_AtObj(h, currentIndex);
  return _asnhex_getDecendantIndexByNthList(h, a[firstNth], nthList);
}

/**
 * get hexadecimal string of ASN.1 TLV refered by current index and nth index list.
 * @name getDecendantHexTLVByNthList
 * @memberOf ASN1HEX
 * @function
 * @param {String} h hexadecimal string of ASN.1 DER encoded data
 * @param {Number} currentIndex start string index of ASN.1 object
 * @param {Array of Number} nthList array list of nth
 * @return {Number} hexadecimal string of ASN.1 TLV refered by nthList
 * @since 1.1
 */
function _asnhex_getDecendantHexTLVByNthList(h, currentIndex, nthList) {
  var idx = _asnhex_getDecendantIndexByNthList(h, currentIndex, nthList);
  return _asnhex_getHexOfTLV_AtObj(h, idx);
}

/**
 * get hexadecimal string of ASN.1 V refered by current index and nth index list.
 * @name getDecendantHexVByNthList
 * @memberOf ASN1HEX
 * @function
 * @param {String} h hexadecimal string of ASN.1 DER encoded data
 * @param {Number} currentIndex start string index of ASN.1 object
 * @param {Array of Number} nthList array list of nth
 * @return {Number} hexadecimal string of ASN.1 V refered by nthList
 * @since 1.1
 */
function _asnhex_getDecendantHexVByNthList(h, currentIndex, nthList) {
  var idx = _asnhex_getDecendantIndexByNthList(h, currentIndex, nthList);
  return _asnhex_getHexOfV_AtObj(h, idx);
}

// ========== class definition ==============================

/**
 * ASN.1 DER encoded hexadecimal string utility class
 * @class ASN.1 DER encoded hexadecimal string utility class
 * @author Kenji Urushima
 * @version 1.1 (09 May 2012)
 * @see <a href="http://kjur.github.com/jsrsasigns/">'jwrsasign'(RSA Sign JavaScript Library) home page http://kjur.github.com/jsrsasign/</a>
 * @since 1.1
 */
var ASN1HEX = function ASN1HEX() {
  return ASN1HEX;
}

ASN1HEX.getByteLengthOfL_AtObj = _asnhex_getByteLengthOfL_AtObj;
ASN1HEX.getHexOfL_AtObj = _asnhex_getHexOfL_AtObj;
ASN1HEX.getIntOfL_AtObj = _asnhex_getIntOfL_AtObj;
ASN1HEX.getStartPosOfV_AtObj = _asnhex_getStartPosOfV_AtObj;
ASN1HEX.getHexOfV_AtObj = _asnhex_getHexOfV_AtObj;
ASN1HEX.getHexOfTLV_AtObj = _asnhex_getHexOfTLV_AtObj;
ASN1HEX.getPosOfNextSibling_AtObj = _asnhex_getPosOfNextSibling_AtObj;
ASN1HEX.getPosArrayOfChildren_AtObj = _asnhex_getPosArrayOfChildren_AtObj;
ASN1HEX.getNthChildIndex_AtObj = _asnhex_getNthChildIndex_AtObj;
ASN1HEX.getDecendantIndexByNthList = _asnhex_getDecendantIndexByNthList;
ASN1HEX.getDecendantHexVByNthList = _asnhex_getDecendantHexVByNthList;
ASN1HEX.getDecendantHexTLVByNthList = _asnhex_getDecendantHexTLVByNthList;

exports.ASN1HEX = ASN1HEX;
module.exports = exports;

},{"jsbn":84}],16:[function(require,module,exports){
// Copyright (c) 2003-2009  Tom Wu
// All Rights Reserved.
// 
// Permission is hereby granted, free of charge, to any person obtaining
// a copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to
// permit persons to whom the Software is furnished to do so, subject to
// the following conditions:
//
// The above copyright notice and this permission notice shall be
// included in all copies or substantial portions of the Software.
// 
// See "jrsasig-THIRDPARTYLICENSE.txt" for details.

var b64map="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
var b64pad="=";
var BI_RM = "0123456789abcdefghijklmnopqrstuvwxyz"
function int2char(n) { return BI_RM.charAt(n); }

function hex2b64(h) {
  var i;
  var c;
  var ret = "";
  for(i = 0; i+3 <= h.length; i+=3) {
    c = parseInt(h.substring(i,i+3),16);
    ret += b64map.charAt(c >> 6) + b64map.charAt(c & 63);
  }
  if(i+1 == h.length) {
    c = parseInt(h.substring(i,i+1),16);
    ret += b64map.charAt(c << 2);
  }
  else if(i+2 == h.length) {
    c = parseInt(h.substring(i,i+2),16);
    ret += b64map.charAt(c >> 2) + b64map.charAt((c & 3) << 4);
  }
  if (b64pad) while((ret.length & 3) > 0) ret += b64pad;
  return ret;
}

// convert a base64 string to hex
function b64tohex(s) {
  var ret = ""
  var i;
  var k = 0; // b64 state, 0-3
  var slop;
  for(i = 0; i < s.length; ++i) {
    if(s.charAt(i) == b64pad) break;
    v = b64map.indexOf(s.charAt(i));
    if(v < 0) continue;
    if(k == 0) {
      ret += int2char(v >> 2);
      slop = v & 3;
      k = 1;
    }
    else if(k == 1) {
      ret += int2char((slop << 2) | (v >> 4));
      slop = v & 0xf;
      k = 2;
    }
    else if(k == 2) {
      ret += int2char(slop);
      ret += int2char(v >> 2);
      slop = v & 3;
      k = 3;
    }
    else {
      ret += int2char((slop << 2) | (v >> 4));
      ret += int2char(v & 0xf);
      k = 0;
    }
  }
  if(k == 1)
    ret += int2char(slop << 2);
  return ret;
}

// convert a base64 string to a byte/number array
function b64toBA(s) {
  //piggyback on b64tohex for now, optimize later
  var h = b64tohex(s);
  var i;
  var a = new Array();
  for(i = 0; 2*i < h.length; ++i) {
    a[i] = parseInt(h.substring(2*i,2*i+2),16);
  }
  return a;
}


exports.b64tohex = b64tohex;
exports.b64toBA  = b64toBA;
exports.hex2b64  = hex2b64;

module.exports = exports;

},{}],17:[function(require,module,exports){
/*
CryptoJS v3.1.2
code.google.com/p/crypto-js
(c) 2009-2013 by Jeff Mott. All rights reserved.

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and 
associated documentation files (the "Software"), to deal in the Software without restriction, including 
without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or 
sell copies of the Software, and to permit persons to whom the Software is furnished to do so, 
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

code.google.com/p/crypto-js/wiki/License
*/
/**
 * CryptoJS core components.
 */
var CryptoJS = CryptoJS || (function (Math, undefined) {
    /**
     * CryptoJS namespace.
     */
    var C = {};

    /**
     * Library namespace.
     */
    var C_lib = C.lib = {};

    /**
     * Base object for prototypal inheritance.
     */
    var Base = C_lib.Base = (function () {
        function F() {}

        return {
            /**
             * Creates a new object that inherits from this object.
             *
             * @param {Object} overrides Properties to copy into the new object.
             *
             * @return {Object} The new object.
             *
             * @static
             *
             * @example
             *
             *     var MyType = CryptoJS.lib.Base.extend({
             *         field: 'value',
             *
             *         method: function () {
             *         }
             *     });
             */
            extend: function (overrides) {
                // Spawn
                F.prototype = this;
                var subtype = new F();

                // Augment
                if (overrides) {
                    subtype.mixIn(overrides);
                }

                // Create default initializer
                if (!subtype.hasOwnProperty('init')) {
                    subtype.init = function () {
                        subtype.$super.init.apply(this, arguments);
                    };
                }

                // Initializer's prototype is the subtype object
                subtype.init.prototype = subtype;

                // Reference supertype
                subtype.$super = this;

                return subtype;
            },

            /**
             * Extends this object and runs the init method.
             * Arguments to create() will be passed to init().
             *
             * @return {Object} The new object.
             *
             * @static
             *
             * @example
             *
             *     var instance = MyType.create();
             */
            create: function () {
                var instance = this.extend();
                instance.init.apply(instance, arguments);

                return instance;
            },

            /**
             * Initializes a newly created object.
             * Override this method to add some logic when your objects are created.
             *
             * @example
             *
             *     var MyType = CryptoJS.lib.Base.extend({
             *         init: function () {
             *             // ...
             *         }
             *     });
             */
            init: function () {
            },

            /**
             * Copies properties into this object.
             *
             * @param {Object} properties The properties to mix in.
             *
             * @example
             *
             *     MyType.mixIn({
             *         field: 'value'
             *     });
             */
            mixIn: function (properties) {
                for (var propertyName in properties) {
                    if (properties.hasOwnProperty(propertyName)) {
                        this[propertyName] = properties[propertyName];
                    }
                }

                // IE won't copy toString using the loop above
                if (properties.hasOwnProperty('toString')) {
                    this.toString = properties.toString;
                }
            },

            /**
             * Creates a copy of this object.
             *
             * @return {Object} The clone.
             *
             * @example
             *
             *     var clone = instance.clone();
             */
            clone: function () {
                return this.init.prototype.extend(this);
            }
        };
    }());

    /**
     * An array of 32-bit words.
     *
     * @property {Array} words The array of 32-bit words.
     * @property {number} sigBytes The number of significant bytes in this word array.
     */
    var WordArray = C_lib.WordArray = Base.extend({
        /**
         * Initializes a newly created word array.
         *
         * @param {Array} words (Optional) An array of 32-bit words.
         * @param {number} sigBytes (Optional) The number of significant bytes in the words.
         *
         * @example
         *
         *     var wordArray = CryptoJS.lib.WordArray.create();
         *     var wordArray = CryptoJS.lib.WordArray.create([0x00010203, 0x04050607]);
         *     var wordArray = CryptoJS.lib.WordArray.create([0x00010203, 0x04050607], 6);
         */
        init: function (words, sigBytes) {
            words = this.words = words || [];

            if (sigBytes != undefined) {
                this.sigBytes = sigBytes;
            } else {
                this.sigBytes = words.length * 4;
            }
        },

        /**
         * Converts this word array to a string.
         *
         * @param {Encoder} encoder (Optional) The encoding strategy to use. Default: CryptoJS.enc.Hex
         *
         * @return {string} The stringified word array.
         *
         * @example
         *
         *     var string = wordArray + '';
         *     var string = wordArray.toString();
         *     var string = wordArray.toString(CryptoJS.enc.Utf8);
         */
        toString: function (encoder) {
            return (encoder || Hex).stringify(this);
        },

        /**
         * Concatenates a word array to this word array.
         *
         * @param {WordArray} wordArray The word array to append.
         *
         * @return {WordArray} This word array.
         *
         * @example
         *
         *     wordArray1.concat(wordArray2);
         */
        concat: function (wordArray) {
            // Shortcuts
            var thisWords = this.words;
            var thatWords = wordArray.words;
            var thisSigBytes = this.sigBytes;
            var thatSigBytes = wordArray.sigBytes;

            // Clamp excess bits
            this.clamp();

            // Concat
            if (thisSigBytes % 4) {
                // Copy one byte at a time
                for (var i = 0; i < thatSigBytes; i++) {
                    var thatByte = (thatWords[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
                    thisWords[(thisSigBytes + i) >>> 2] |= thatByte << (24 - ((thisSigBytes + i) % 4) * 8);
                }
            } else if (thatWords.length > 0xffff) {
                // Copy one word at a time
                for (var i = 0; i < thatSigBytes; i += 4) {
                    thisWords[(thisSigBytes + i) >>> 2] = thatWords[i >>> 2];
                }
            } else {
                // Copy all words at once
                thisWords.push.apply(thisWords, thatWords);
            }
            this.sigBytes += thatSigBytes;

            // Chainable
            return this;
        },

        /**
         * Removes insignificant bits.
         *
         * @example
         *
         *     wordArray.clamp();
         */
        clamp: function () {
            // Shortcuts
            var words = this.words;
            var sigBytes = this.sigBytes;

            // Clamp
            words[sigBytes >>> 2] &= 0xffffffff << (32 - (sigBytes % 4) * 8);
            words.length = Math.ceil(sigBytes / 4);
        },

        /**
         * Creates a copy of this word array.
         *
         * @return {WordArray} The clone.
         *
         * @example
         *
         *     var clone = wordArray.clone();
         */
        clone: function () {
            var clone = Base.clone.call(this);
            clone.words = this.words.slice(0);

            return clone;
        },

        /**
         * Creates a word array filled with random bytes.
         *
         * @param {number} nBytes The number of random bytes to generate.
         *
         * @return {WordArray} The random word array.
         *
         * @static
         *
         * @example
         *
         *     var wordArray = CryptoJS.lib.WordArray.random(16);
         */
        random: function (nBytes) {
            var words = [];
            for (var i = 0; i < nBytes; i += 4) {
                words.push((Math.random() * 0x100000000) | 0);
            }

            return new WordArray.init(words, nBytes);
        }
    });

    /**
     * Encoder namespace.
     */
    var C_enc = C.enc = {};

    /**
     * Hex encoding strategy.
     */
    var Hex = C_enc.Hex = {
        /**
         * Converts a word array to a hex string.
         *
         * @param {WordArray} wordArray The word array.
         *
         * @return {string} The hex string.
         *
         * @static
         *
         * @example
         *
         *     var hexString = CryptoJS.enc.Hex.stringify(wordArray);
         */
        stringify: function (wordArray) {
            // Shortcuts
            var words = wordArray.words;
            var sigBytes = wordArray.sigBytes;

            // Convert
            var hexChars = [];
            for (var i = 0; i < sigBytes; i++) {
                var bite = (words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
                hexChars.push((bite >>> 4).toString(16));
                hexChars.push((bite & 0x0f).toString(16));
            }

            return hexChars.join('');
        },

        /**
         * Converts a hex string to a word array.
         *
         * @param {string} hexStr The hex string.
         *
         * @return {WordArray} The word array.
         *
         * @static
         *
         * @example
         *
         *     var wordArray = CryptoJS.enc.Hex.parse(hexString);
         */
        parse: function (hexStr) {
            // Shortcut
            var hexStrLength = hexStr.length;

            // Convert
            var words = [];
            for (var i = 0; i < hexStrLength; i += 2) {
                words[i >>> 3] |= parseInt(hexStr.substr(i, 2), 16) << (24 - (i % 8) * 4);
            }

            return new WordArray.init(words, hexStrLength / 2);
        }
    };

    /**
     * Latin1 encoding strategy.
     */
    var Latin1 = C_enc.Latin1 = {
        /**
         * Converts a word array to a Latin1 string.
         *
         * @param {WordArray} wordArray The word array.
         *
         * @return {string} The Latin1 string.
         *
         * @static
         *
         * @example
         *
         *     var latin1String = CryptoJS.enc.Latin1.stringify(wordArray);
         */
        stringify: function (wordArray) {
            // Shortcuts
            var words = wordArray.words;
            var sigBytes = wordArray.sigBytes;

            // Convert
            var latin1Chars = [];
            for (var i = 0; i < sigBytes; i++) {
                var bite = (words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
                latin1Chars.push(String.fromCharCode(bite));
            }

            return latin1Chars.join('');
        },

        /**
         * Converts a Latin1 string to a word array.
         *
         * @param {string} latin1Str The Latin1 string.
         *
         * @return {WordArray} The word array.
         *
         * @static
         *
         * @example
         *
         *     var wordArray = CryptoJS.enc.Latin1.parse(latin1String);
         */
        parse: function (latin1Str) {
            // Shortcut
            var latin1StrLength = latin1Str.length;

            // Convert
            var words = [];
            for (var i = 0; i < latin1StrLength; i++) {
                words[i >>> 2] |= (latin1Str.charCodeAt(i) & 0xff) << (24 - (i % 4) * 8);
            }

            return new WordArray.init(words, latin1StrLength);
        }
    };

    /**
     * UTF-8 encoding strategy.
     */
    var Utf8 = C_enc.Utf8 = {
        /**
         * Converts a word array to a UTF-8 string.
         *
         * @param {WordArray} wordArray The word array.
         *
         * @return {string} The UTF-8 string.
         *
         * @static
         *
         * @example
         *
         *     var utf8String = CryptoJS.enc.Utf8.stringify(wordArray);
         */
        stringify: function (wordArray) {
            try {
                return decodeURIComponent(escape(Latin1.stringify(wordArray)));
            } catch (e) {
                throw new Error('Malformed UTF-8 data');
            }
        },

        /**
         * Converts a UTF-8 string to a word array.
         *
         * @param {string} utf8Str The UTF-8 string.
         *
         * @return {WordArray} The word array.
         *
         * @static
         *
         * @example
         *
         *     var wordArray = CryptoJS.enc.Utf8.parse(utf8String);
         */
        parse: function (utf8Str) {
            return Latin1.parse(unescape(encodeURIComponent(utf8Str)));
        }
    };

    /**
     * Abstract buffered block algorithm template.
     *
     * The property blockSize must be implemented in a concrete subtype.
     *
     * @property {number} _minBufferSize The number of blocks that should be kept unprocessed in the buffer. Default: 0
     */
    var BufferedBlockAlgorithm = C_lib.BufferedBlockAlgorithm = Base.extend({
        /**
         * Resets this block algorithm's data buffer to its initial state.
         *
         * @example
         *
         *     bufferedBlockAlgorithm.reset();
         */
        reset: function () {
            // Initial values
            this._data = new WordArray.init();
            this._nDataBytes = 0;
        },

        /**
         * Adds new data to this block algorithm's buffer.
         *
         * @param {WordArray|string} data The data to append. Strings are converted to a WordArray using UTF-8.
         *
         * @example
         *
         *     bufferedBlockAlgorithm._append('data');
         *     bufferedBlockAlgorithm._append(wordArray);
         */
        _append: function (data) {
            // Convert string to WordArray, else assume WordArray already
            if (typeof data == 'string') {
                data = Utf8.parse(data);
            }

            // Append
            this._data.concat(data);
            this._nDataBytes += data.sigBytes;
        },

        /**
         * Processes available data blocks.
         *
         * This method invokes _doProcessBlock(offset), which must be implemented by a concrete subtype.
         *
         * @param {boolean} doFlush Whether all blocks and partial blocks should be processed.
         *
         * @return {WordArray} The processed data.
         *
         * @example
         *
         *     var processedData = bufferedBlockAlgorithm._process();
         *     var processedData = bufferedBlockAlgorithm._process(!!'flush');
         */
        _process: function (doFlush) {
            // Shortcuts
            var data = this._data;
            var dataWords = data.words;
            var dataSigBytes = data.sigBytes;
            var blockSize = this.blockSize;
            var blockSizeBytes = blockSize * 4;

            // Count blocks ready
            var nBlocksReady = dataSigBytes / blockSizeBytes;
            if (doFlush) {
                // Round up to include partial blocks
                nBlocksReady = Math.ceil(nBlocksReady);
            } else {
                // Round down to include only full blocks,
                // less the number of blocks that must remain in the buffer
                nBlocksReady = Math.max((nBlocksReady | 0) - this._minBufferSize, 0);
            }

            // Count words ready
            var nWordsReady = nBlocksReady * blockSize;

            // Count bytes ready
            var nBytesReady = Math.min(nWordsReady * 4, dataSigBytes);

            // Process blocks
            if (nWordsReady) {
                for (var offset = 0; offset < nWordsReady; offset += blockSize) {
                    // Perform concrete-algorithm logic
                    this._doProcessBlock(dataWords, offset);
                }

                // Remove processed words
                var processedWords = dataWords.splice(0, nWordsReady);
                data.sigBytes -= nBytesReady;
            }

            // Return processed words
            return new WordArray.init(processedWords, nBytesReady);
        },

        /**
         * Creates a copy of this object.
         *
         * @return {Object} The clone.
         *
         * @example
         *
         *     var clone = bufferedBlockAlgorithm.clone();
         */
        clone: function () {
            var clone = Base.clone.call(this);
            clone._data = this._data.clone();

            return clone;
        },

        _minBufferSize: 0
    });

    /**
     * Abstract hasher template.
     *
     * @property {number} blockSize The number of 32-bit words this hasher operates on. Default: 16 (512 bits)
     */
    var Hasher = C_lib.Hasher = BufferedBlockAlgorithm.extend({
        /**
         * Configuration options.
         */
        cfg: Base.extend(),

        /**
         * Initializes a newly created hasher.
         *
         * @param {Object} cfg (Optional) The configuration options to use for this hash computation.
         *
         * @example
         *
         *     var hasher = CryptoJS.algo.SHA256.create();
         */
        init: function (cfg) {
            // Apply config defaults
            this.cfg = this.cfg.extend(cfg);

            // Set initial values
            this.reset();
        },

        /**
         * Resets this hasher to its initial state.
         *
         * @example
         *
         *     hasher.reset();
         */
        reset: function () {
            // Reset data buffer
            BufferedBlockAlgorithm.reset.call(this);

            // Perform concrete-hasher logic
            this._doReset();
        },

        /**
         * Updates this hasher with a message.
         *
         * @param {WordArray|string} messageUpdate The message to append.
         *
         * @return {Hasher} This hasher.
         *
         * @example
         *
         *     hasher.update('message');
         *     hasher.update(wordArray);
         */
        update: function (messageUpdate) {
            // Append
            this._append(messageUpdate);

            // Update the hash
            this._process();

            // Chainable
            return this;
        },

        /**
         * Finalizes the hash computation.
         * Note that the finalize operation is effectively a destructive, read-once operation.
         *
         * @param {WordArray|string} messageUpdate (Optional) A final message update.
         *
         * @return {WordArray} The hash.
         *
         * @example
         *
         *     var hash = hasher.finalize();
         *     var hash = hasher.finalize('message');
         *     var hash = hasher.finalize(wordArray);
         */
        finalize: function (messageUpdate) {
            // Final message update
            if (messageUpdate) {
                this._append(messageUpdate);
            }

            // Perform concrete-hasher logic
            var hash = this._doFinalize();

            return hash;
        },

        blockSize: 512/32,

        /**
         * Creates a shortcut function to a hasher's object interface.
         *
         * @param {Hasher} hasher The hasher to create a helper for.
         *
         * @return {Function} The shortcut function.
         *
         * @static
         *
         * @example
         *
         *     var SHA256 = CryptoJS.lib.Hasher._createHelper(CryptoJS.algo.SHA256);
         */
        _createHelper: function (hasher) {
            return function (message, cfg) {
                return new hasher.init(cfg).finalize(message);
            };
        },

        /**
         * Creates a shortcut function to the HMAC's object interface.
         *
         * @param {Hasher} hasher The hasher to use in this HMAC helper.
         *
         * @return {Function} The shortcut function.
         *
         * @static
         *
         * @example
         *
         *     var HmacSHA256 = CryptoJS.lib.Hasher._createHmacHelper(CryptoJS.algo.SHA256);
         */
        _createHmacHelper: function (hasher) {
            return function (message, key) {
                return new C_algo.HMAC.init(hasher, key).finalize(message);
            };
        }
    });

    /**
     * Algorithm namespace.
     */
    var C_algo = C.algo = {};

    return C;
}(Math));

exports.CryptoJS = CryptoJS;
module.exports = exports;

},{}],18:[function(require,module,exports){
/*! crypto-1.0.4.js (c) 2013 Kenji Urushima | kjur.github.com/jsrsasign/license
 */
/*
 * crypto.js - Cryptographic Algorithm Provider class
 *
 * Copyright (c) 2013 Kenji Urushima (kenji.urushima@gmail.com)
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * 
 * This software is licensed under the terms of the MIT License.
 * http://kjur.github.com/jsrsasign/license
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 */

/**
 * @fileOverview
 * @name crypto-1.0.js
 * @author Kenji Urushima kenji.urushima@gmail.com
 * @version 1.0.4 (2013-Mar-28)
 * @since 2.2
 * @license <a href="http://kjur.github.io/jsrsasign/license/">MIT License</a>
 */
var CryptoJS = require('./sha256.js').CryptoJS
var BigInteger = require('jsbn')
function parseBigInt(str,r) {
  return new BigInteger(str,r);
}

/** 
 * kjur's class library name space
 * @name KJUR
 * @namespace kjur's class library name space
 */
if (typeof KJUR == "undefined" || !KJUR) KJUR = {};
/**
 * kjur's cryptographic algorithm provider library name space
 * <p>
 * This namespace privides following crytpgrahic classes.
 * <ul>
 * <li>{@link KJUR.crypto.MessageDigest} - Java JCE(cryptograhic extension) style MessageDigest class</li>
 * <li>{@link KJUR.crypto.Signature} - Java JCE(cryptograhic extension) style Signature class</li>
 * <li>{@link KJUR.crypto.Util} - cryptographic utility functions and properties</li>
 * </ul>
 * NOTE: Please ignore method summary and document of this namespace. This caused by a bug of jsdoc2.
 * </p>
 * @name KJUR.crypto
 * @namespace
 */
if (typeof KJUR.crypto == "undefined" || !KJUR.crypto) KJUR.crypto = {};

/**
 * static object for cryptographic function utilities
 * @name KJUR.crypto.Util
 * @class static object for cryptographic function utilities
 * @property {Array} DIGESTINFOHEAD PKCS#1 DigestInfo heading hexadecimal bytes for each hash algorithms
 * @description
 */
KJUR.crypto.Util = new function() {
    this.DIGESTINFOHEAD = {
	'sha1':      "3021300906052b0e03021a05000414",
        'sha224':    "302d300d06096086480165030402040500041c",
	'sha256':    "3031300d060960864801650304020105000420",
	'sha384':    "3041300d060960864801650304020205000430",
	'sha512':    "3051300d060960864801650304020305000440",
	'md2':       "3020300c06082a864886f70d020205000410",
	'md5':       "3020300c06082a864886f70d020505000410",
	'ripemd160': "3021300906052b2403020105000414"
    };

    /**
     * get hexadecimal DigestInfo
     * @name getDigestInfoHex
     * @memberOf KJUR.crypto.Util
     * @function
     * @param {String} hHash hexadecimal hash value
     * @param {String} alg hash algorithm name (ex. 'sha1')
     * @return {String} hexadecimal string DigestInfo ASN.1 structure
     */
    this.getDigestInfoHex = function(hHash, alg) {
	if (typeof this.DIGESTINFOHEAD[alg] == "undefined")
	    throw "alg not supported in Util.DIGESTINFOHEAD: " + alg;
	return this.DIGESTINFOHEAD[alg] + hHash;
    };

    /**
     * get PKCS#1 padded hexadecimal DigestInfo
     * @name getPaddedDigestInfoHex
     * @memberOf KJUR.crypto.Util
     * @function
     * @param {String} hHash hexadecimal hash value
     * @param {String} alg hash algorithm name (ex. 'sha1')
     * @param {Integer} keySize key bit length (ex. 1024)
     * @return {String} hexadecimal string of PKCS#1 padded DigestInfo
     */
    this.getPaddedDigestInfoHex = function(hHash, alg, keySize) {
	var hDigestInfo = this.getDigestInfoHex(hHash, alg);
	var pmStrLen = keySize / 4; // minimum PM length

	if (hDigestInfo.length + 22 > pmStrLen) // len(0001+ff(*8)+00+hDigestInfo)=22
	    throw "key is too short for SigAlg: keylen=" + keySize + "," + alg;

	var hHead = "0001";
	var hTail = "00" + hDigestInfo;
	var hMid = "";
	var fLen = pmStrLen - hHead.length - hTail.length;
	for (var i = 0; i < fLen; i += 2) {
	    hMid += "ff";
	}
	var hPaddedMessage = hHead + hMid + hTail;
	return hPaddedMessage;
    };

    /**
     * get hexadecimal SHA1 hash of string
     * @name sha1
     * @memberOf KJUR.crypto.Util
     * @function
     * @param {String} s input string to be hashed
     * @return {String} hexadecimal string of hash value
     * @since 1.0.3
     */
    this.sha1 = function(s) {
        var md = new KJUR.crypto.MessageDigest({'alg':'sha1', 'prov':'cryptojs'});
        return md.digestString(s);
    };

    /**
     * get hexadecimal SHA256 hash of string
     * @name sha256
     * @memberOf KJUR.crypto.Util
     * @function
     * @param {String} s input string to be hashed
     * @return {String} hexadecimal string of hash value
     * @since 1.0.3
     */
    this.sha256 = function(s) {
        var md = new KJUR.crypto.MessageDigest({'alg':'sha256', 'prov':'cryptojs'});
        return md.digestString(s);
    };

    /**
     * get hexadecimal SHA512 hash of string
     * @name sha512
     * @memberOf KJUR.crypto.Util
     * @function
     * @param {String} s input string to be hashed
     * @return {String} hexadecimal string of hash value
     * @since 1.0.3
     */
    this.sha512 = function(s) {
        var md = new KJUR.crypto.MessageDigest({'alg':'sha512', 'prov':'cryptojs'});
        return md.digestString(s);
    };

    /**
     * get hexadecimal MD5 hash of string
     * @name md5
     * @memberOf KJUR.crypto.Util
     * @function
     * @param {String} s input string to be hashed
     * @return {String} hexadecimal string of hash value
     * @since 1.0.3
     */
    this.md5 = function(s) {
        var md = new KJUR.crypto.MessageDigest({'alg':'md5', 'prov':'cryptojs'});
        return md.digestString(s);
    };

    /**
     * get hexadecimal RIPEMD160 hash of string
     * @name ripemd160
     * @memberOf KJUR.crypto.Util
     * @function
     * @param {String} s input string to be hashed
     * @return {String} hexadecimal string of hash value
     * @since 1.0.3
     */
    this.ripemd160 = function(s) {
        var md = new KJUR.crypto.MessageDigest({'alg':'ripemd160', 'prov':'cryptojs'});
        return md.digestString(s);
    };
};

/**
 * MessageDigest class which is very similar to java.security.MessageDigest class
 * @name KJUR.crypto.MessageDigest
 * @class MessageDigest class which is very similar to java.security.MessageDigest class
 * @param {Array} params parameters for constructor
 * @description
 * <br/>
 * Currently this supports following algorithm and providers combination:
 * <ul>
 * <li>md5 - cryptojs</li>
 * <li>sha1 - cryptojs</li>
 * <li>sha224 - cryptojs</li>
 * <li>sha256 - cryptojs</li>
 * <li>sha384 - cryptojs</li>
 * <li>sha512 - cryptojs</li>
 * <li>ripemd160 - cryptojs</li>
 * <li>sha256 - sjcl (NEW from crypto.js 1.0.4)</li>
 * </ul>
 * @example
 * // CryptoJS provider sample
 * &lt;script src="http://crypto-js.googlecode.com/svn/tags/3.1.2/build/components/core.js"&gt;&lt;/script&gt;
 * &lt;script src="http://crypto-js.googlecode.com/svn/tags/3.1.2/build/components/sha1.js"&gt;&lt;/script&gt;
 * &lt;script src="crypto-1.0.js"&gt;&lt;/script&gt;
 * var md = new KJUR.crypto.MessageDigest({alg: "sha1", prov: "cryptojs"});
 * md.updateString('aaa')
 * var mdHex = md.digest()
 *
 * // SJCL(Stanford JavaScript Crypto Library) provider sample
 * &lt;script src="http://bitwiseshiftleft.github.io/sjcl/sjcl.js"&gt;&lt;/script&gt;
 * &lt;script src="crypto-1.0.js"&gt;&lt;/script&gt;
 * var md = new KJUR.crypto.MessageDigest({alg: "sha256", prov: "sjcl"}); // sjcl supports sha256 only
 * md.updateString('aaa')
 * var mdHex = md.digest()
 */
KJUR.crypto.MessageDigest = function(params) {
    var md = null;
    var algName = null;
    var provName = null;
    var _CryptoJSMdName = {
	'md5': 'CryptoJS.algo.MD5',
	'sha1': 'CryptoJS.algo.SHA1',
	'sha224': 'CryptoJS.algo.SHA224',
	'sha256': 'CryptoJS.algo.SHA256',
	'sha384': 'CryptoJS.algo.SHA384',
	'sha512': 'CryptoJS.algo.SHA512',
	'ripemd160': 'CryptoJS.algo.RIPEMD160'
    };

    /**
     * set hash algorithm and provider
     * @name setAlgAndProvider
     * @memberOf KJUR.crypto.MessageDigest
     * @function
     * @param {String} alg hash algorithm name
     * @param {String} prov provider name
     * @description
     * @example
     * // for SHA1
     * md.setAlgAndProvider('sha1', 'cryptojs');
     * // for RIPEMD160
     * md.setAlgAndProvider('ripemd160', 'cryptojs');
     */
    this.setAlgAndProvider = function(alg, prov) {
	if (':md5:sha1:sha224:sha256:sha384:sha512:ripemd160:'.indexOf(alg) != -1 &&
	    prov == 'cryptojs') {
	    try {
		this.md = eval(_CryptoJSMdName[alg]).create();
	    } catch (ex) {
		throw "setAlgAndProvider hash alg set fail alg=" + alg + "/" + ex;
	    }
	    this.updateString = function(str) {
		this.md.update(str);
	    };
	    this.updateHex = function(hex) {
		var wHex = CryptoJS.enc.Hex.parse(hex);
		this.md.update(wHex);
	    };
	    this.digest = function() {
		var hash = this.md.finalize();
		return hash.toString(CryptoJS.enc.Hex);
	    };
	    this.digestString = function(str) {
		this.updateString(str);
		return this.digest();
	    };
	    this.digestHex = function(hex) {
		this.updateHex(hex);
		return this.digest();
	    };
	}
	if (':sha256:'.indexOf(alg) != -1 &&
	    prov == 'sjcl') {
	    try {
		this.md = new sjcl.hash.sha256();
	    } catch (ex) {
		throw "setAlgAndProvider hash alg set fail alg=" + alg + "/" + ex;
	    }
	    this.updateString = function(str) {
		this.md.update(str);
	    };
	    this.updateHex = function(hex) {
		var baHex = sjcl.codec.hex.toBits(hex);
		this.md.update(baHex);
	    };
	    this.digest = function() {
		var hash = this.md.finalize();
		return sjcl.codec.hex.fromBits(hash);
	    };
	    this.digestString = function(str) {
		this.updateString(str);
		return this.digest();
	    };
	    this.digestHex = function(hex) {
		this.updateHex(hex);
		return this.digest();
	    };
	}
    };

    /**
     * update digest by specified string
     * @name updateString
     * @memberOf KJUR.crypto.MessageDigest
     * @function
     * @param {String} str string to update
     * @description
     * @example
     * md.updateString('New York');
     */
    this.updateString = function(str) {
	throw "updateString(str) not supported for this alg/prov: " + this.algName + "/" + this.provName;
    };

    /**
     * update digest by specified hexadecimal string
     * @name updateHex
     * @memberOf KJUR.crypto.MessageDigest
     * @function
     * @param {String} hex hexadecimal string to update
     * @description
     * @example
     * md.updateHex('0afe36');
     */
    this.updateHex = function(hex) {
	throw "updateHex(hex) not supported for this alg/prov: " + this.algName + "/" + this.provName;
    };

    /**
     * completes hash calculation and returns hash result
     * @name digest
     * @memberOf KJUR.crypto.MessageDigest
     * @function
     * @description
     * @example
     * md.digest()
     */
    this.digest = function() {
	throw "digest() not supported for this alg/prov: " + this.algName + "/" + this.provName;
    };

    /**
     * performs final update on the digest using string, then completes the digest computation
     * @name digestString
     * @memberOf KJUR.crypto.MessageDigest
     * @function
     * @param {String} str string to final update
     * @description
     * @example
     * md.digestString('aaa')
     */
    this.digestString = function(str) {
	throw "digestString(str) not supported for this alg/prov: " + this.algName + "/" + this.provName;
    };

    /**
     * performs final update on the digest using hexadecimal string, then completes the digest computation
     * @name digestHex
     * @memberOf KJUR.crypto.MessageDigest
     * @function
     * @param {String} hex hexadecimal string to final update
     * @description
     * @example
     * md.digestHex('0f2abd')
     */
    this.digestHex = function(hex) {
	throw "digestHex(hex) not supported for this alg/prov: " + this.algName + "/" + this.provName;
    };

    if (typeof params != "undefined") {
	if (typeof params['alg'] != "undefined") {
	    this.algName = params['alg'];
	    this.provName = params['prov'];
	    this.setAlgAndProvider(params['alg'], params['prov']);
	}
    }
};


/**
 * Signature class which is very similar to java.security.Signature class
 * @name KJUR.crypto.Signature
 * @class Signature class which is very similar to java.security.Signature class
 * @param {Array} params parameters for constructor
 * @property {String} state Current state of this signature object whether 'SIGN', 'VERIFY' or null
 * @description
 * <br/>
 * As for params of constructor's argument, it can be specify following attributes:
 * <ul>
 * <li>alg - signature algorithm name (ex. {MD5,SHA1,SHA224,SHA256,SHA384,SHA512,RIPEMD160}withRSA)</li>
 * <li>provider - currently 'cryptojs/jsrsa' only</li>
 * <li>prvkeypem - PEM string of signer's private key. If this specified, no need to call initSign(prvKey).</li>
 * </ul>
 * <h4>SUPPORTED ALGORITHMS AND PROVIDERS</h4>
 * Signature class supports {MD5,SHA1,SHA224,SHA256,SHA384,SHA512,RIPEMD160}
 * withRSA algorithm in 'cryptojs/jsrsa' provider.
 * <h4>EXAMPLES</h4>
 * @example
 * // signature generation
 * var sig = new KJUR.crypto.Signature({"alg": "SHA1withRSA", "prov": "cryptojs/jsrsa"});
 * sig.initSign(prvKey);
 * sig.updateString('aaa');
 * var hSigVal = sig.sign();
 *
 * // signature validation
 * var sig2 = new KJUR.crypto.Signature({"alg": "SHA1withRSA", "prov": "cryptojs/jsrsa"});
 * sig2.initVerifyByCertificatePEM(cert)
 * sig.updateString('aaa');
 * var isValid = sig2.verify(hSigVal);
 */
KJUR.crypto.Signature = function(params) {
    var prvKey = null; // RSAKey for signing
    var pubKey = null; // RSAKey for verifying

    var md = null; // KJUR.crypto.MessageDigest object
    var sig = null;
    var algName = null;
    var provName = null;
    var algProvName = null;
    var mdAlgName = null;
    var pubkeyAlgName = null;
    var state = null;

    var sHashHex = null; // hex hash value for hex
    var hDigestInfo = null;
    var hPaddedDigestInfo = null;
    var hSign = null;

    this._setAlgNames = function() {
	if (this.algName.match(/^(.+)with(.+)$/)) {
	    this.mdAlgName = RegExp.$1.toLowerCase();
	    this.pubkeyAlgName = RegExp.$2.toLowerCase();
	}
    };

    this._zeroPaddingOfSignature = function(hex, bitLength) {
	var s = "";
	var nZero = bitLength / 4 - hex.length;
	for (var i = 0; i < nZero; i++) {
	    s = s + "0";
	}
	return s + hex;
    };

    /**
     * set signature algorithm and provider
     * @name setAlgAndProvider
     * @memberOf KJUR.crypto.Signature
     * @function
     * @param {String} alg signature algorithm name
     * @param {String} prov provider name
     * @description
     * @example
     * md.setAlgAndProvider('SHA1withRSA', 'cryptojs/jsrsa');
     */
    this.setAlgAndProvider = function(alg, prov) {
	this._setAlgNames();
	if (prov != 'cryptojs/jsrsa')
	    throw "provider not supported: " + prov;

	if (':md5:sha1:sha224:sha256:sha384:sha512:ripemd160:'.indexOf(this.mdAlgName) != -1) {
	    try {
		this.md = new KJUR.crypto.MessageDigest({'alg':this.mdAlgName,'prov':'cryptojs'});
	    } catch (ex) {
		throw "setAlgAndProvider hash alg set fail alg=" + this.mdAlgName + "/" + ex;
	    }

	    this.initSign = function(prvKey) {
		this.prvKey = prvKey;
		this.state = "SIGN";
	    };

	    this.initVerifyByPublicKey = function(rsaPubKey) {
		this.pubKey = rsaPubKey;
		this.state = "VERIFY";
	    };

	    this.initVerifyByCertificatePEM = function(certPEM) {
		var x509 = new X509();
		x509.readCertPEM(certPEM);
		this.pubKey = x509.subjectPublicKeyRSA;
		this.state = "VERIFY";
	    };

	    this.updateString = function(str) {
		this.md.updateString(str);
	    };
	    this.updateHex = function(hex) {
		this.md.updateHex(hex);
	    };
	    this.sign = function() {
                var util = KJUR.crypto.Util;
		var keyLen = this.prvKey.n.bitLength();
		this.sHashHex = this.md.digest();
		this.hDigestInfo = util.getDigestInfoHex(this.sHashHex, this.mdAlgName);
		this.hPaddedDigestInfo = 
                    util.getPaddedDigestInfoHex(this.sHashHex, this.mdAlgName, keyLen);

		var biPaddedDigestInfo = parseBigInt(this.hPaddedDigestInfo, 16);
		this.hoge = biPaddedDigestInfo.toString(16);

		var biSign = this.prvKey.doPrivate(biPaddedDigestInfo);
		this.hSign = this._zeroPaddingOfSignature(biSign.toString(16), keyLen);
		return this.hSign;
	    };
	    this.signString = function(str) {
		this.updateString(str);
		this.sign();
	    };
	    this.signHex = function(hex) {
		this.updateHex(hex);
		this.sign();
	    };
	    this.verify = function(hSigVal) {
                var util = KJUR.crypto.Util;
		var keyLen = this.pubKey.n.bitLength();
		this.sHashHex = this.md.digest();

		var biSigVal = parseBigInt(hSigVal, 16);
		var biPaddedDigestInfo = this.pubKey.doPublic(biSigVal);
		this.hPaddedDigestInfo = biPaddedDigestInfo.toString(16);
                var s = this.hPaddedDigestInfo;
                s = s.replace(/^1ff+00/, '');

		var hDIHEAD = KJUR.crypto.Util.DIGESTINFOHEAD[this.mdAlgName];
                if (s.indexOf(hDIHEAD) != 0) {
		    return false;
		}
		var hHashFromDI = s.substr(hDIHEAD.length);
		//alert(hHashFromDI + "\n" + this.sHashHex);
		return (hHashFromDI == this.sHashHex);
	    };
	}
    };

    /**
     * Initialize this object for verifying with a public key
     * @name initVerifyByPublicKey
     * @memberOf KJUR.crypto.Signature
     * @function
     * @param {RSAKey} rsaPubKey RSAKey object of public key
     * @since 1.0.2
     * @description
     * @example
     * sig.initVerifyByPublicKey(prvKey)
     */
    this.initVerifyByPublicKey = function(rsaPubKey) {
	throw "initVerifyByPublicKey(rsaPubKeyy) not supported for this alg:prov=" + this.algProvName;
    };

    /**
     * Initialize this object for verifying with a certficate
     * @name initVerifyByCertificatePEM
     * @memberOf KJUR.crypto.Signature
     * @function
     * @param {String} certPEM PEM formatted string of certificate
     * @since 1.0.2
     * @description
     * @example
     * sig.initVerifyByCertificatePEM(certPEM)
     */
    this.initVerifyByCertificatePEM = function(certPEM) {
	throw "initVerifyByCertificatePEM(certPEM) not supported for this alg:prov=" + this.algProvName;
    };

    /**
     * Initialize this object for signing
     * @name initSign
     * @memberOf KJUR.crypto.Signature
     * @function
     * @param {RSAKey} prvKey RSAKey object of private key
     * @description
     * @example
     * sig.initSign(prvKey)
     */
    this.initSign = function(prvKey) {
	throw "initSign(prvKey) not supported for this alg:prov=" + this.algProvName;
    };

    /**
     * Updates the data to be signed or verified by a string
     * @name updateString
     * @memberOf KJUR.crypto.Signature
     * @function
     * @param {String} str string to use for the update
     * @description
     * @example
     * sig.updateString('aaa')
     */
    this.updateString = function(str) {
	throw "updateString(str) not supported for this alg:prov=" + this.algProvName;
    };

    /**
     * Updates the data to be signed or verified by a hexadecimal string
     * @name updateHex
     * @memberOf KJUR.crypto.Signature
     * @function
     * @param {String} hex hexadecimal string to use for the update
     * @description
     * @example
     * sig.updateHex('1f2f3f')
     */
    this.updateHex = function(hex) {
	throw "updateHex(hex) not supported for this alg:prov=" + this.algProvName;
    };

    /**
     * Returns the signature bytes of all data updates as a hexadecimal string
     * @name sign
     * @memberOf KJUR.crypto.Signature
     * @function
     * @return the signature bytes as a hexadecimal string
     * @description
     * @example
     * var hSigValue = sig.sign()
     */
    this.sign = function() {
	throw "sign() not supported for this alg:prov=" + this.algProvName;
    };

    /**
     * performs final update on the sign using string, then returns the signature bytes of all data updates as a hexadecimal string
     * @name signString
     * @memberOf KJUR.crypto.Signature
     * @function
     * @param {String} str string to final update
     * @return the signature bytes of a hexadecimal string
     * @description
     * @example
     * var hSigValue = sig.signString('aaa')
     */
    this.signString = function(str) {
	throw "digestString(str) not supported for this alg:prov=" + this.algProvName;
    };

    /**
     * performs final update on the sign using hexadecimal string, then returns the signature bytes of all data updates as a hexadecimal string
     * @name signHex
     * @memberOf KJUR.crypto.Signature
     * @function
     * @param {String} hex hexadecimal string to final update
     * @return the signature bytes of a hexadecimal string
     * @description
     * @example
     * var hSigValue = sig.signHex('1fdc33')
     */
    this.signHex = function(hex) {
	throw "digestHex(hex) not supported for this alg:prov=" + this.algProvName;
    };

    /**
     * verifies the passed-in signature.
     * @name verify
     * @memberOf KJUR.crypto.Signature
     * @function
     * @param {String} str string to final update
     * @return {Boolean} true if the signature was verified, otherwise false
     * @description
     * @example
     * var isValid = sig.verify('1fbcefdca4823a7(snip)')
     */
    this.verify = function(hSigVal) {
	throw "verify(hSigVal) not supported for this alg:prov=" + this.algProvName;
    };

    if (typeof params != "undefined") {
	if (typeof params['alg'] != "undefined") {
	    this.algName = params['alg'];
	    this.provName = params['prov'];
	    this.algProvName = params['alg'] + ":" + params['prov'];
	    this.setAlgAndProvider(params['alg'], params['prov']);
	    this._setAlgNames();
	}
	if (typeof params['prvkeypem'] != "undefined") {
	    if (typeof params['prvkeypas'] != "undefined") {
		throw "both prvkeypem and prvkeypas parameters not supported";
	    } else {
		try {
		    var prvKey = new RSAKey();
		    prvKey.readPrivateKeyFromPEMString(params['prvkeypem']);
		    this.initSign(prvKey);
		} catch (ex) {
		    throw "fatal error to load pem private key: " + ex;
		}
	    }
	}
    }
};

exports.KJUR = KJUR;
module.exports = exports;

},{"./sha256.js":23,"jsbn":84}],19:[function(require,module,exports){
// Copyright (c) 2003-2009  Tom Wu
// All Rights Reserved.
// 
// Permission is hereby granted, free of charge, to any person obtaining
// a copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to
// permit persons to whom the Software is furnished to do so, subject to
// the following conditions:
//
// The above copyright notice and this permission notice shall be
// included in all copies or substantial portions of the Software.
// 
// See "jrsasig-THIRDPARTYLICENSE.txt" for details.

// Depends on jsbn.js and rng.js
var intShim = require("jsbn");
var BigInteger = intShim.BigInteger ? intShim.BigInteger : intShim ;

// Version 1.1: support utf-8 encoding in pkcs1pad2

// convert a (hex) string to a bignum object
function parseBigInt(str,r) {
  return new BigInteger(str,r);
}

function linebrk(s,n) {
  var ret = "";
  var i = 0;
  while(i + n < s.length) {
    ret += s.substring(i,i+n) + "\n";
    i += n;
  }
  return ret + s.substring(i,s.length);
}

function byte2Hex(b) {
  if(b < 0x10)
    return "0" + b.toString(16);
  else
    return b.toString(16);
}

// PKCS#1 (type 2, random) pad input string s to n bytes, and return a bigint
function pkcs1pad2(s,n) {
  if(n < s.length + 11) { // TODO: fix for utf-8
    alert("Message too long for RSA");
    return null;
  }
  var ba = new Array();
  var i = s.length - 1;
  while(i >= 0 && n > 0) {
    var c = s.charCodeAt(i--);
    if(c < 128) { // encode using utf-8
      ba[--n] = c;
    }
    else if((c > 127) && (c < 2048)) {
      ba[--n] = (c & 63) | 128;
      ba[--n] = (c >> 6) | 192;
    }
    else {
      ba[--n] = (c & 63) | 128;
      ba[--n] = ((c >> 6) & 63) | 128;
      ba[--n] = (c >> 12) | 224;
    }
  }
  ba[--n] = 0;
  var rng = new SecureRandom();
  var x = new Array();
  while(n > 2) { // random non-zero pad
    x[0] = 0;
    while(x[0] == 0) rng.nextBytes(x);
    ba[--n] = x[0];
  }
  ba[--n] = 2;
  ba[--n] = 0;
  return new BigInteger(ba);
}

// PKCS#1 (OAEP) mask generation function
function oaep_mgf1_arr(seed, len, hash)
{
    var mask = '', i = 0;

    while (mask.length < len)
    {
        mask += hash(String.fromCharCode.apply(String, seed.concat([
                (i & 0xff000000) >> 24,
                (i & 0x00ff0000) >> 16,
                (i & 0x0000ff00) >> 8,
                i & 0x000000ff])));
        i += 1;
    }

    return mask;
}

var SHA1_SIZE = 20;

// PKCS#1 (OAEP) pad input string s to n bytes, and return a bigint
function oaep_pad(s, n, hash)
{
    if (s.length + 2 * SHA1_SIZE + 2 > n)
    {
        throw "Message too long for RSA";
    }

    var PS = '', i;

    for (i = 0; i < n - s.length - 2 * SHA1_SIZE - 2; i += 1)
    {
        PS += '\x00';
    }

    var DB = rstr_sha1('') + PS + '\x01' + s;
    var seed = new Array(SHA1_SIZE);
    new SecureRandom().nextBytes(seed);
    
    var dbMask = oaep_mgf1_arr(seed, DB.length, hash || rstr_sha1);
    var maskedDB = [];

    for (i = 0; i < DB.length; i += 1)
    {
        maskedDB[i] = DB.charCodeAt(i) ^ dbMask.charCodeAt(i);
    }

    var seedMask = oaep_mgf1_arr(maskedDB, seed.length, rstr_sha1);
    var maskedSeed = [0];

    for (i = 0; i < seed.length; i += 1)
    {
        maskedSeed[i + 1] = seed[i] ^ seedMask.charCodeAt(i);
    }

    return new BigInteger(maskedSeed.concat(maskedDB));
}

// "empty" RSA key constructor
var RSAKey = function RSAKey() {
  this.n = null;
  this.e = 0;
  this.d = null;
  this.p = null;
  this.q = null;
  this.dmp1 = null;
  this.dmq1 = null;
  this.coeff = null;
}

// Set the public key fields N and e from hex strings
function RSASetPublic(N,E) {
  if (typeof N !== "string")
  {
    this.n = N;
    this.e = E;
  }
  else if(N != null && E != null && N.length > 0 && E.length > 0) {
    this.n = parseBigInt(N,16);
    this.e = parseInt(E,16);
  }
  else
    alert("Invalid RSA public key");
}

// Perform raw public operation on "x": return x^e (mod n)
function RSADoPublic(x) {
  return x.modPowInt(this.e, this.n);
}

// Return the PKCS#1 RSA encryption of "text" as an even-length hex string
function RSAEncrypt(text) {
  var m = pkcs1pad2(text,(this.n.bitLength()+7)>>3);
  if(m == null) return null;
  var c = this.doPublic(m);
  if(c == null) return null;
  var h = c.toString(16);
  if((h.length & 1) == 0) return h; else return "0" + h;
}

// Return the PKCS#1 OAEP RSA encryption of "text" as an even-length hex string
function RSAEncryptOAEP(text, hash) {
  var m = oaep_pad(text, (this.n.bitLength()+7)>>3, hash);
  if(m == null) return null;
  var c = this.doPublic(m);
  if(c == null) return null;
  var h = c.toString(16);
  if((h.length & 1) == 0) return h; else return "0" + h;
}

// Return the PKCS#1 RSA encryption of "text" as a Base64-encoded string
//function RSAEncryptB64(text) {
//  var h = this.encrypt(text);
//  if(h) return hex2b64(h); else return null;
//}

// protected
RSAKey.prototype.doPublic = RSADoPublic;

// public
RSAKey.prototype.setPublic = RSASetPublic;
RSAKey.prototype.encrypt = RSAEncrypt;
RSAKey.prototype.encryptOAEP = RSAEncryptOAEP;

exports.RSAKey = RSAKey;
module.exports = exports;

//RSAKey.prototype.encrypt_b64 = RSAEncryptB64;

},{"jsbn":84}],20:[function(require,module,exports){
// Copyright (c) 2003-2009  Tom Wu
// All Rights Reserved.
// 
// Permission is hereby granted, free of charge, to any person obtaining
// a copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to
// permit persons to whom the Software is furnished to do so, subject to
// the following conditions:
//
// The above copyright notice and this permission notice shall be
// included in all copies or substantial portions of the Software.
// 
// See "jrsasig-THIRDPARTYLICENSE.txt" for details.

// Depends on rsa.js and jsbn2.js
var intShim = require("jsbn")
var BigInteger = intShim.BigInteger ? intShim.BigInteger : intShim ;
var RSAKey = require('./rsa.js').RSAKey;

function parseBigInt(str,r) {
  return new BigInteger(str,r);
}

// Version 1.1: support utf-8 decoding in pkcs1unpad2
// Undo PKCS#1 (type 2, random) padding and, if valid, return the plaintext
function pkcs1unpad2(d,n) {
  var b = d.toByteArray();
  var i = 0;
  while(i < b.length && b[i] == 0) ++i;
  if(b.length-i != n-1 || b[i] != 2)
    return null;
  ++i;
  while(b[i] != 0)
    if(++i >= b.length) return null;
  var ret = "";
  while(++i < b.length) {
    var c = b[i] & 255;
    if(c < 128) { // utf-8 decode
      ret += String.fromCharCode(c);
    }
    else if((c > 191) && (c < 224)) {
      ret += String.fromCharCode(((c & 31) << 6) | (b[i+1] & 63));
      ++i;
    }
    else {
      ret += String.fromCharCode(((c & 15) << 12) | ((b[i+1] & 63) << 6) | (b[i+2] & 63));
      i += 2;
    }
  }
  return ret;
}

// PKCS#1 (OAEP) mask generation function
function oaep_mgf1_str(seed, len, hash)
{
    var mask = '', i = 0;

    while (mask.length < len)
    {
        mask += hash(seed + String.fromCharCode.apply(String, [
                (i & 0xff000000) >> 24,
                (i & 0x00ff0000) >> 16,
                (i & 0x0000ff00) >> 8,
                i & 0x000000ff]));
        i += 1;
    }

    return mask;
}

var SHA1_SIZE = 20;

// Undo PKCS#1 (OAEP) padding and, if valid, return the plaintext
function oaep_unpad(d, n, hash)
{
    d = d.toByteArray();

    var i;

    for (i = 0; i < d.length; i += 1)
    {
        d[i] &= 0xff;
    }

    while (d.length < n)
    {
        d.unshift(0);
    }

    d = String.fromCharCode.apply(String, d);

    if (d.length < 2 * SHA1_SIZE + 2)
    {
        throw "Cipher too short";
    }

    var maskedSeed = d.substr(1, SHA1_SIZE)
    var maskedDB = d.substr(SHA1_SIZE + 1);

    var seedMask = oaep_mgf1_str(maskedDB, SHA1_SIZE, hash || rstr_sha1);
    var seed = [], i;

    for (i = 0; i < maskedSeed.length; i += 1)
    {
        seed[i] = maskedSeed.charCodeAt(i) ^ seedMask.charCodeAt(i);
    }

    var dbMask = oaep_mgf1_str(String.fromCharCode.apply(String, seed),
                           d.length - SHA1_SIZE, rstr_sha1);

    var DB = [];

    for (i = 0; i < maskedDB.length; i += 1)
    {
        DB[i] = maskedDB.charCodeAt(i) ^ dbMask.charCodeAt(i);
    }

    DB = String.fromCharCode.apply(String, DB);

    if (DB.substr(0, SHA1_SIZE) !== rstr_sha1(''))
    {
        throw "Hash mismatch";
    }

    DB = DB.substr(SHA1_SIZE);

    var first_one = DB.indexOf('\x01');
    var last_zero = (first_one != -1) ? DB.substr(0, first_one).lastIndexOf('\x00') : -1;

    if (last_zero + 1 != first_one)
    {
        throw "Malformed data";
    }

    return DB.substr(first_one + 1);
}

// Set the private key fields N, e, and d from hex strings
function RSASetPrivate(N,E,D) {
  if (typeof N !== "string")
  {
    this.n = N;
    this.e = E;
    this.d = D;
  }
  else if(N != null && E != null && N.length > 0 && E.length > 0) {
    this.n = parseBigInt(N,16);
    this.e = parseInt(E,16);
    this.d = parseBigInt(D,16);
  }
  else
    alert("Invalid RSA private key");
}

// Set the private key fields N, e, d and CRT params from hex strings
function RSASetPrivateEx(N,E,D,P,Q,DP,DQ,C) {
  //alert("RSASetPrivateEx called");
  if (N == null) throw "RSASetPrivateEx N == null";
  if (E == null) throw "RSASetPrivateEx E == null";
  if (N.length == 0) throw "RSASetPrivateEx N.length == 0";
  if (E.length == 0) throw "RSASetPrivateEx E.length == 0";

  if (N != null && E != null && N.length > 0 && E.length > 0) {
    this.n = parseBigInt(N,16);
    this.e = parseInt(E,16);
    this.d = parseBigInt(D,16);
    this.p = parseBigInt(P,16);
    this.q = parseBigInt(Q,16);
    this.dmp1 = parseBigInt(DP,16);
    this.dmq1 = parseBigInt(DQ,16);
    this.coeff = parseBigInt(C,16);
  } else {
    alert("Invalid RSA private key in RSASetPrivateEx");
  }
}

// Generate a new random private key B bits long, using public expt E
function RSAGenerate(B,E) {
  var rng = new SecureRandom();
  var qs = B>>1;
  this.e = parseInt(E,16);
  var ee = new BigInteger(E,16);
  for(;;) {
    for(;;) {
      this.p = new BigInteger(B-qs,1,rng);
      if(this.p.subtract(BigInteger.ONE).gcd(ee).compareTo(BigInteger.ONE) == 0 && this.p.isProbablePrime(10)) break;
    }
    for(;;) {
      this.q = new BigInteger(qs,1,rng);
      if(this.q.subtract(BigInteger.ONE).gcd(ee).compareTo(BigInteger.ONE) == 0 && this.q.isProbablePrime(10)) break;
    }
    if(this.p.compareTo(this.q) <= 0) {
      var t = this.p;
      this.p = this.q;
      this.q = t;
    }
    var p1 = this.p.subtract(BigInteger.ONE);	// p1 = p - 1
    var q1 = this.q.subtract(BigInteger.ONE);	// q1 = q - 1
    var phi = p1.multiply(q1);
    if(phi.gcd(ee).compareTo(BigInteger.ONE) == 0) {
      this.n = this.p.multiply(this.q);	// this.n = p * q
      this.d = ee.modInverse(phi);	// this.d = 
      this.dmp1 = this.d.mod(p1);	// this.dmp1 = d mod (p - 1)
      this.dmq1 = this.d.mod(q1);	// this.dmq1 = d mod (q - 1)
      this.coeff = this.q.modInverse(this.p);	// this.coeff = (q ^ -1) mod p
      break;
    }
  }
}

// Perform raw private operation on "x": return x^d (mod n)
function RSADoPrivate(x) {
  if(this.p == null || this.q == null)
    return x.modPow(this.d, this.n);

  // TODO: re-calculate any missing CRT params
  var xp = x.mod(this.p).modPow(this.dmp1, this.p); // xp=cp?
  var xq = x.mod(this.q).modPow(this.dmq1, this.q); // xq=cq?

  while(xp.compareTo(xq) < 0)
    xp = xp.add(this.p);
  // NOTE:
  // xp.subtract(xq) => cp -cq
  // xp.subtract(xq).multiply(this.coeff).mod(this.p) => (cp - cq) * u mod p = h
  // xp.subtract(xq).multiply(this.coeff).mod(this.p).multiply(this.q).add(xq) => cq + (h * q) = M
  return xp.subtract(xq).multiply(this.coeff).mod(this.p).multiply(this.q).add(xq);
}

// Return the PKCS#1 RSA decryption of "ctext".
// "ctext" is an even-length hex string and the output is a plain string.
function RSADecrypt(ctext) {
  var c = parseBigInt(ctext, 16);
  var m = this.doPrivate(c);
  if(m == null) return null;
  return pkcs1unpad2(m, (this.n.bitLength()+7)>>3);
}

// Return the PKCS#1 OAEP RSA decryption of "ctext".
// "ctext" is an even-length hex string and the output is a plain string.
function RSADecryptOAEP(ctext, hash) {
  var c = parseBigInt(ctext, 16);
  var m = this.doPrivate(c);
  if(m == null) return null;
  return oaep_unpad(m, (this.n.bitLength()+7)>>3, hash);
}

// Return the PKCS#1 RSA decryption of "ctext".
// "ctext" is a Base64-encoded string and the output is a plain string.
//function RSAB64Decrypt(ctext) {
//  var h = b64tohex(ctext);
//  if(h) return this.decrypt(h); else return null;
//}

// protected
RSAKey.prototype.doPrivate = RSADoPrivate;

// public
RSAKey.prototype.setPrivate = RSASetPrivate;
RSAKey.prototype.setPrivateEx = RSASetPrivateEx;
RSAKey.prototype.generate = RSAGenerate;
RSAKey.prototype.decrypt = RSADecrypt;
RSAKey.prototype.decryptOAEP = RSADecryptOAEP;
//RSAKey.prototype.b64_decrypt = RSAB64Decrypt;

exports.RSAKey = RSAKey;
module.exports = exports;

},{"./rsa.js":19,"jsbn":84}],21:[function(require,module,exports){
/*! rsapem-1.1.js (c) 2012 Kenji Urushima | kjur.github.com/jsrsasign/license
 */
//
// rsa-pem.js - adding function for reading/writing PKCS#1 PEM private key
//              to RSAKey class.
//
// version: 1.1.1 (2013-Apr-12)
//
// Copyright (c) 2010-2013 Kenji Urushima (kenji.urushima@gmail.com)
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
// 
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
// 
// This software is licensed under the terms of the MIT License.
// http://kjur.github.com/jsrsasign/license/
// 
//
// Depends on:
//
//
//
// _RSApem_pemToBase64(sPEM)
//
//   removing PEM header, PEM footer and space characters including
//   new lines from PEM formatted RSA private key string.
//
var ASN1HEX = require('./asn1hex-1.1.js').ASN1HEX;
var b64tohex = require('./base64.js').b64tohex;
var RSAKey = require('./rsa2.js').RSAKey;

/**
 * @fileOverview
 * @name rsapem-1.1.js
 * @author Kenji Urushima kenji.urushima@gmail.com
 * @version 1.1
 * @license <a href="http://kjur.github.io/jsrsasign/license/">MIT License</a>
 */
function _rsapem_pemToBase64(sPEMPrivateKey) {
  var s = sPEMPrivateKey;
  s = s.replace("-----BEGIN RSA PRIVATE KEY-----", "");
  s = s.replace("-----END RSA PRIVATE KEY-----", "");
  s = s.replace(/[ \n]+/g, "");
  return s;
}

function _rsapem_getPosArrayOfChildrenFromHex(hPrivateKey) {
  var a = new Array();
  var v1 = ASN1HEX.getStartPosOfV_AtObj(hPrivateKey, 0);
  var n1 = ASN1HEX.getPosOfNextSibling_AtObj(hPrivateKey, v1);
  var e1 = ASN1HEX.getPosOfNextSibling_AtObj(hPrivateKey, n1);
  var d1 = ASN1HEX.getPosOfNextSibling_AtObj(hPrivateKey, e1);
  var p1 = ASN1HEX.getPosOfNextSibling_AtObj(hPrivateKey, d1);
  var q1 = ASN1HEX.getPosOfNextSibling_AtObj(hPrivateKey, p1);
  var dp1 = ASN1HEX.getPosOfNextSibling_AtObj(hPrivateKey, q1);
  var dq1 = ASN1HEX.getPosOfNextSibling_AtObj(hPrivateKey, dp1);
  var co1 = ASN1HEX.getPosOfNextSibling_AtObj(hPrivateKey, dq1);
  a.push(v1, n1, e1, d1, p1, q1, dp1, dq1, co1);
  return a;
}

function _rsapem_getHexValueArrayOfChildrenFromHex(hPrivateKey) {
  var posArray = _rsapem_getPosArrayOfChildrenFromHex(hPrivateKey);
  var v =  ASN1HEX.getHexOfV_AtObj(hPrivateKey, posArray[0]);
  var n =  ASN1HEX.getHexOfV_AtObj(hPrivateKey, posArray[1]);
  var e =  ASN1HEX.getHexOfV_AtObj(hPrivateKey, posArray[2]);
  var d =  ASN1HEX.getHexOfV_AtObj(hPrivateKey, posArray[3]);
  var p =  ASN1HEX.getHexOfV_AtObj(hPrivateKey, posArray[4]);
  var q =  ASN1HEX.getHexOfV_AtObj(hPrivateKey, posArray[5]);
  var dp = ASN1HEX.getHexOfV_AtObj(hPrivateKey, posArray[6]);
  var dq = ASN1HEX.getHexOfV_AtObj(hPrivateKey, posArray[7]);
  var co = ASN1HEX.getHexOfV_AtObj(hPrivateKey, posArray[8]);
  var a = new Array();
  a.push(v, n, e, d, p, q, dp, dq, co);
  return a;
}

/**
 * read RSA private key from a ASN.1 hexadecimal string
 * @name readPrivateKeyFromASN1HexString
 * @memberOf RSAKey#
 * @function
 * @param {String} keyHex ASN.1 hexadecimal string of PKCS#1 private key.
 * @since 1.1.1
 */
function _rsapem_readPrivateKeyFromASN1HexString(keyHex) {
  var a = _rsapem_getHexValueArrayOfChildrenFromHex(keyHex);
  this.setPrivateEx(a[1],a[2],a[3],a[4],a[5],a[6],a[7],a[8]);
}

/**
 * read PKCS#1 private key from a string
 * @name readPrivateKeyFromPEMString
 * @memberOf RSAKey#
 * @function
 * @param {String} keyPEM string of PKCS#1 private key.
 */
function _rsapem_readPrivateKeyFromPEMString(keyPEM) {
  var keyB64 = _rsapem_pemToBase64(keyPEM);
  var keyHex = b64tohex(keyB64) // depends base64.js
  var a = _rsapem_getHexValueArrayOfChildrenFromHex(keyHex);
  this.setPrivateEx(a[1],a[2],a[3],a[4],a[5],a[6],a[7],a[8]);
}

RSAKey.prototype.readPrivateKeyFromPEMString = _rsapem_readPrivateKeyFromPEMString;
RSAKey.prototype.readPrivateKeyFromASN1HexString = _rsapem_readPrivateKeyFromASN1HexString;

exports.RSAKey = RSAKey;
module.exports = exports;

},{"./asn1hex-1.1.js":15,"./base64.js":16,"./rsa2.js":20}],22:[function(require,module,exports){
/*! rsasign-1.2.2.js (c) 2012 Kenji Urushima | kjur.github.com/jsrsasign/license
 */
//
// rsa-sign.js - adding signing functions to RSAKey class.
//
//
// version: 1.2.2 (13 May 2013)
//
// Copyright (c) 2010-2013 Kenji Urushima (kenji.urushima@gmail.com)
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
// 
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
// 
// This software is licensed under the terms of the MIT License.
// http://kjur.github.com/jsrsasign/license/
//
//
// Depends on:
//   function sha1.hex(s) of sha1.js
//   jsbn.js
//   jsbn2.js
//   rsa.js
//   rsa2.js
//
var intShim = require('jsbn');
var BigInteger = (intShim.BigInteger) ? intShim.BigInteger : intShim ; 
var RSAKey = require('./rsapem-1.1.js').RSAKey;

function parseBigInt(str,r) {
  return new BigInteger(str,r);
}

// keysize / pmstrlen
//  512 /  128
// 1024 /  256
// 2048 /  512
// 4096 / 1024

/**
 * @fileOverview
 * @name rsasign-1.2.js
 * @author Kenji Urushima kenji.urushima@gmail.com
 * @version 1.2.2
 * @license <a href="http://kjur.github.io/jsrsasign/license/">MIT License</a>
 */

/**
 * @property {Dictionary} _RSASIGN_DIHEAD
 * @description Array of head part of hexadecimal DigestInfo value for hash algorithms.
 * You can add any DigestInfo hash algorith for signing.
 * See PKCS#1 v2.1 spec (p38).
 */
var _RSASIGN_DIHEAD = [];
_RSASIGN_DIHEAD['sha1'] =      "3021300906052b0e03021a05000414";
_RSASIGN_DIHEAD['sha256'] =    "3031300d060960864801650304020105000420";
_RSASIGN_DIHEAD['sha384'] =    "3041300d060960864801650304020205000430";
_RSASIGN_DIHEAD['sha512'] =    "3051300d060960864801650304020305000440";
_RSASIGN_DIHEAD['md2'] =       "3020300c06082a864886f70d020205000410";
_RSASIGN_DIHEAD['md5'] =       "3020300c06082a864886f70d020505000410";
_RSASIGN_DIHEAD['ripemd160'] = "3021300906052b2403020105000414";

/**
 * @property {Dictionary} _RSASIGN_HASHHEXFUNC
 * @description Array of functions which calculate hash and returns it as hexadecimal.
 * You can add any hash algorithm implementations.
 */
var _RSASIGN_HASHHEXFUNC = [];
_RSASIGN_HASHHEXFUNC['sha1'] =      function(s){return KJUR.crypto.Util.sha1(s);};
_RSASIGN_HASHHEXFUNC['sha256'] =    function(s){return KJUR.crypto.Util.sha256(s);}
_RSASIGN_HASHHEXFUNC['sha512'] =    function(s){return KJUR.crypto.Util.sha512(s);}
_RSASIGN_HASHHEXFUNC['md5'] =       function(s){return KJUR.crypto.Util.md5(s);};
_RSASIGN_HASHHEXFUNC['ripemd160'] = function(s){return KJUR.crypto.Util.ripemd160(s);};

//_RSASIGN_HASHHEXFUNC['sha1'] =   function(s){return sha1.hex(s);}   // http://user1.matsumoto.ne.jp/~goma/js/hash.html
//_RSASIGN_HASHHEXFUNC['sha256'] = function(s){return sha256.hex;}    // http://user1.matsumoto.ne.jp/~goma/js/hash.html

var _RE_HEXDECONLY = new RegExp("");
_RE_HEXDECONLY.compile("[^0-9a-f]", "gi");

// ========================================================================
// Signature Generation
// ========================================================================

function _rsasign_getHexPaddedDigestInfoForString(s, keySize, hashAlg) {
    var pmStrLen = keySize / 4;
    var hashFunc = _RSASIGN_HASHHEXFUNC[hashAlg];
    var sHashHex = hashFunc(s);

    var sHead = "0001";
    var sTail = "00" + _RSASIGN_DIHEAD[hashAlg] + sHashHex;
    var sMid = "";
    var fLen = pmStrLen - sHead.length - sTail.length;
    for (var i = 0; i < fLen; i += 2) {
	sMid += "ff";
    }
    sPaddedMessageHex = sHead + sMid + sTail;
    return sPaddedMessageHex;
}

function _zeroPaddingOfSignature(hex, bitLength) {
    var s = "";
    var nZero = bitLength / 4 - hex.length;
    for (var i = 0; i < nZero; i++) {
	s = s + "0";
    }
    return s + hex;
}

/**
 * sign for a message string with RSA private key.<br/>
 * @name signString
 * @memberOf RSAKey#
 * @function
 * @param {String} s message string to be signed.
 * @param {String} hashAlg hash algorithm name for signing.<br/>
 * @return returns hexadecimal string of signature value.
 */
function _rsasign_signString(s, hashAlg) {
    //alert("this.n.bitLength() = " + this.n.bitLength());
    var hPM = _rsasign_getHexPaddedDigestInfoForString(s, this.n.bitLength(), hashAlg);
    var biPaddedMessage = parseBigInt(hPM, 16);
    var biSign = this.doPrivate(biPaddedMessage);
    var hexSign = biSign.toString(16);
    return _zeroPaddingOfSignature(hexSign, this.n.bitLength());
}

function _rsasign_signStringWithSHA1(s) {
    return _rsasign_signString.call(this, s, 'sha1');
}

function _rsasign_signStringWithSHA256(s) {
    return _rsasign_signString.call(this, s, 'sha256');
}

// PKCS#1 (PSS) mask generation function
function pss_mgf1_str(seed, len, hash) {
    var mask = '', i = 0;

    while (mask.length < len) {
        mask += hash(seed + String.fromCharCode.apply(String, [
                (i & 0xff000000) >> 24,
                (i & 0x00ff0000) >> 16,
                (i & 0x0000ff00) >> 8,
                i & 0x000000ff]));
        i += 1;
    }

    return mask;
}

/**
 * sign for a message string with RSA private key by PKCS#1 PSS signing.<br/>
 * @name signStringPSS
 * @memberOf RSAKey#
 * @function
 * @param {String} s message string to be signed.
 * @param {String} hashAlg hash algorithm name for signing.<br/>
 * @return returns hexadecimal string of signature value.
 */
function _rsasign_signStringPSS(s, hashAlg, sLen) {
    var hashFunc = _RSASIGN_HASHRAWFUNC[hashAlg];
    var mHash = hashFunc(s);
    var hLen = mHash.length;
    var emBits = this.n.bitLength() - 1;
    var emLen = Math.ceil(emBits / 8);
    var i;

    if (sLen === -1) {
        sLen = hLen; // same has hash length
    } else if ((sLen === -2) || (sLen === undefined)) {
        sLen = emLen - hLen - 2; // maximum
    } else if (sLen < -2) {
        throw "invalid salt length";
    }

    if (emLen < (hLen + sLen + 2)) {
        throw "data too long";
    }

    var salt = '';

    if (sLen > 0) {
        salt = new Array(sLen);
        new SecureRandom().nextBytes(salt);
        salt = String.fromCharCode.apply(String, salt);
    }

    var H = hashFunc('\x00\x00\x00\x00\x00\x00\x00\x00' + mHash + salt);
    var PS = [];

    for (i = 0; i < emLen - sLen - hLen - 2; i += 1) {
        PS[i] = 0x00;
    }

    var DB = String.fromCharCode.apply(String, PS) + '\x01' + salt;
    var dbMask = pss_mgf1_str(H, DB.length, hashFunc);
    var maskedDB = [];

    for (i = 0; i < DB.length; i += 1) {
        maskedDB[i] = DB.charCodeAt(i) ^ dbMask.charCodeAt(i);
    }

    var mask = (0xff00 >> (8 * emLen - emBits)) & 0xff;
    maskedDB[0] &= ~mask;

    for (i = 0; i < hLen; i++) {
        maskedDB.push(H.charCodeAt(i));
    }

    maskedDB.push(0xbc);

    return _zeroPaddingOfSignature(
            this.doPrivate(new BigInteger(maskedDB)).toString(16),
            this.n.bitLength());
}

// ========================================================================
// Signature Verification
// ========================================================================

function _rsasign_getDecryptSignatureBI(biSig, hN, hE) {
    var rsa = new RSAKey();
    rsa.setPublic(hN, hE);
    var biDecryptedSig = rsa.doPublic(biSig);
    return biDecryptedSig;
}

function _rsasign_getHexDigestInfoFromSig(biSig, hN, hE) {
    var biDecryptedSig = _rsasign_getDecryptSignatureBI(biSig, hN, hE);
    var hDigestInfo = biDecryptedSig.toString(16).replace(/^1f+00/, '');
    return hDigestInfo;
}

function _rsasign_getAlgNameAndHashFromHexDisgestInfo(hDigestInfo) {
    for (var algName in _RSASIGN_DIHEAD) {
	var head = _RSASIGN_DIHEAD[algName];
	var len = head.length;
	if (hDigestInfo.substring(0, len) == head) {
	    var a = [algName, hDigestInfo.substring(len)];
	    return a;
	}
    }
    return [];
}

function _rsasign_verifySignatureWithArgs(sMsg, biSig, hN, hE) {
    var hDigestInfo = _rsasign_getHexDigestInfoFromSig(biSig, hN, hE);
    var digestInfoAry = _rsasign_getAlgNameAndHashFromHexDisgestInfo(hDigestInfo);
    if (digestInfoAry.length == 0) return false;
    var algName = digestInfoAry[0];
    var diHashValue = digestInfoAry[1];
    var ff = _RSASIGN_HASHHEXFUNC[algName];
    var msgHashValue = ff(sMsg);
    return (diHashValue == msgHashValue);
}

function _rsasign_verifyHexSignatureForMessage(hSig, sMsg) {
    var biSig = parseBigInt(hSig, 16);
    var result = _rsasign_verifySignatureWithArgs(sMsg, biSig,
						  this.n.toString(16),
						  this.e.toString(16));
    return result;
}

/**
 * verifies a sigature for a message string with RSA public key.<br/>
 * @name verifyString
 * @memberOf RSAKey#
 * @function
 * @param {String} sMsg message string to be verified.
 * @param {String} hSig hexadecimal string of siganture.<br/>
 *                 non-hexadecimal charactors including new lines will be ignored.
 * @return returns 1 if valid, otherwise 0
 */
function _rsasign_verifyString(sMsg, hSig) {
    hSig = hSig.replace(_RE_HEXDECONLY, '');
    if (hSig.length != this.n.bitLength() / 4) return 0;
    hSig = hSig.replace(/[ \n]+/g, "");
    var biSig = parseBigInt(hSig, 16);
    var biDecryptedSig = this.doPublic(biSig);
    var hDigestInfo = biDecryptedSig.toString(16).replace(/^1f+00/, '');
    var digestInfoAry = _rsasign_getAlgNameAndHashFromHexDisgestInfo(hDigestInfo);
  
    if (digestInfoAry.length == 0) return false;
    var algName = digestInfoAry[0];
    var diHashValue = digestInfoAry[1];
    var ff = _RSASIGN_HASHHEXFUNC[algName];
    var msgHashValue = ff(sMsg);
    return (diHashValue == msgHashValue);
}

/**
 * verifies a sigature for a message string with RSA public key by PKCS#1 PSS sign.<br/>
 * @name verifyStringPSS
 * @memberOf RSAKey#
 * @function
 * @param {String} sMsg message string to be verified.
 * @param {String} hSig hexadecimal string of siganture.<br/>
 *                 non-hexadecimal charactors including new lines will be ignored.
 * @return returns 1 if valid, otherwise 0
 */
function _rsasign_verifyStringPSS(sMsg, hSig, hashAlg, sLen) {
    if (hSig.length !== this.n.bitLength() / 4) {
        return false;
    }

    var hashFunc = _RSASIGN_HASHRAWFUNC[hashAlg];
    var mHash = hashFunc(sMsg);
    var hLen = mHash.length;
    var emBits = this.n.bitLength() - 1;
    var emLen = Math.ceil(emBits / 8);
    var i;

    if (sLen === -1) {
        sLen = hLen; // same has hash length
    } else if ((sLen === -2) || (sLen === undefined)) {
        sLen = emLen - hLen - 2; // maximum
    } else if (sLen < -2) {
        throw "invalid salt length";
    }

    if (emLen < (hLen + sLen + 2)) {
        throw "data too long";
    }

    var em = this.doPublic(parseBigInt(hSig, 16)).toByteArray();

    for (i = 0; i < em.length; i += 1) {
        em[i] &= 0xff;
    }

    while (em.length < emLen) {
        em.unshift(0);
    }

    if (em[emLen -1] !== 0xbc) {
        throw "encoded message does not end in 0xbc";
    }

    em = String.fromCharCode.apply(String, em);

    var maskedDB = em.substr(0, emLen - hLen - 1);
    var H = em.substr(maskedDB.length, hLen);

    var mask = (0xff00 >> (8 * emLen - emBits)) & 0xff;

    if ((maskedDB.charCodeAt(0) & mask) !== 0) {
        throw "bits beyond keysize not zero";
    }

    var dbMask = pss_mgf1_str(H, maskedDB.length, hashFunc);
    var DB = [];

    for (i = 0; i < maskedDB.length; i += 1) {
        DB[i] = maskedDB.charCodeAt(i) ^ dbMask.charCodeAt(i);
    }

    DB[0] &= ~mask;

    var checkLen = emLen - hLen - sLen - 2;

    for (i = 0; i < checkLen; i += 1) {
        if (DB[i] !== 0x00) {
            throw "leftmost octets not zero";
        }
    }

    if (DB[checkLen] !== 0x01) {
        throw "0x01 marker not found";
    }

    return H === hashFunc('\x00\x00\x00\x00\x00\x00\x00\x00' + mHash +
                          String.fromCharCode.apply(String, DB.slice(-sLen)));
}

RSAKey.prototype.signString = _rsasign_signString;
RSAKey.prototype.signStringWithSHA1 = _rsasign_signStringWithSHA1;
RSAKey.prototype.signStringWithSHA256 = _rsasign_signStringWithSHA256;
RSAKey.prototype.sign = _rsasign_signString;
RSAKey.prototype.signWithSHA1 = _rsasign_signStringWithSHA1;
RSAKey.prototype.signWithSHA256 = _rsasign_signStringWithSHA256;
RSAKey.prototype.signStringPSS = _rsasign_signStringPSS;
RSAKey.prototype.signPSS = _rsasign_signStringPSS;
RSAKey.SALT_LEN_HLEN = -1;
RSAKey.SALT_LEN_MAX = -2;

RSAKey.prototype.verifyString = _rsasign_verifyString;
RSAKey.prototype.verifyHexSignatureForMessage = _rsasign_verifyHexSignatureForMessage;
RSAKey.prototype.verify = _rsasign_verifyString;
RSAKey.prototype.verifyHexSignatureForByteArrayMessage = _rsasign_verifyHexSignatureForMessage;
RSAKey.prototype.verifyStringPSS = _rsasign_verifyStringPSS;
RSAKey.prototype.verifyPSS = _rsasign_verifyStringPSS;
RSAKey.SALT_LEN_RECOVER = -2;

/**
 * @name RSAKey
 * @class key of RSA public key algorithm
 * @description Tom Wu's RSA Key class and extension
 */

exports.RSAKey = RSAKey
module.exports = exports;

},{"./rsapem-1.1.js":21,"jsbn":84}],23:[function(require,module,exports){
/*
CryptoJS v3.1.2
code.google.com/p/crypto-js
(c) 2009-2013 by Jeff Mott. All rights reserved.

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and 
associated documentation files (the "Software"), to deal in the Software without restriction, including 
without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or 
sell copies of the Software, and to permit persons to whom the Software is furnished to do so, 
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

code.google.com/p/crypto-js/wiki/License
*/

var C = require('./core.js').CryptoJS;
(function (Math) {
    // Shortcuts
    var C_lib = C.lib;
    var WordArray = C_lib.WordArray;
    var Hasher = C_lib.Hasher;
    var C_algo = C.algo;

    // Initialization and round constants tables
    var H = [];
    var K = [];

    // Compute constants
    (function () {
        function isPrime(n) {
            var sqrtN = Math.sqrt(n);
            for (var factor = 2; factor <= sqrtN; factor++) {
                if (!(n % factor)) {
                    return false;
                }
            }

            return true;
        }

        function getFractionalBits(n) {
            return ((n - (n | 0)) * 0x100000000) | 0;
        }

        var n = 2;
        var nPrime = 0;
        while (nPrime < 64) {
            if (isPrime(n)) {
                if (nPrime < 8) {
                    H[nPrime] = getFractionalBits(Math.pow(n, 1 / 2));
                }
                K[nPrime] = getFractionalBits(Math.pow(n, 1 / 3));

                nPrime++;
            }

            n++;
        }
    }());

    // Reusable object
    var W = [];

    /**
     * SHA-256 hash algorithm.
     */
    var SHA256 = C_algo.SHA256 = Hasher.extend({
        _doReset: function () {
            this._hash = new WordArray.init(H.slice(0));
        },

        _doProcessBlock: function (M, offset) {
            // Shortcut
            var H = this._hash.words;

            // Working variables
            var a = H[0];
            var b = H[1];
            var c = H[2];
            var d = H[3];
            var e = H[4];
            var f = H[5];
            var g = H[6];
            var h = H[7];

            // Computation
            for (var i = 0; i < 64; i++) {
                if (i < 16) {
                    W[i] = M[offset + i] | 0;
                } else {
                    var gamma0x = W[i - 15];
                    var gamma0  = ((gamma0x << 25) | (gamma0x >>> 7))  ^
                                  ((gamma0x << 14) | (gamma0x >>> 18)) ^
                                   (gamma0x >>> 3);

                    var gamma1x = W[i - 2];
                    var gamma1  = ((gamma1x << 15) | (gamma1x >>> 17)) ^
                                  ((gamma1x << 13) | (gamma1x >>> 19)) ^
                                   (gamma1x >>> 10);

                    W[i] = gamma0 + W[i - 7] + gamma1 + W[i - 16];
                }

                var ch  = (e & f) ^ (~e & g);
                var maj = (a & b) ^ (a & c) ^ (b & c);

                var sigma0 = ((a << 30) | (a >>> 2)) ^ ((a << 19) | (a >>> 13)) ^ ((a << 10) | (a >>> 22));
                var sigma1 = ((e << 26) | (e >>> 6)) ^ ((e << 21) | (e >>> 11)) ^ ((e << 7)  | (e >>> 25));

                var t1 = h + sigma1 + ch + K[i] + W[i];
                var t2 = sigma0 + maj;

                h = g;
                g = f;
                f = e;
                e = (d + t1) | 0;
                d = c;
                c = b;
                b = a;
                a = (t1 + t2) | 0;
            }

            // Intermediate hash value
            H[0] = (H[0] + a) | 0;
            H[1] = (H[1] + b) | 0;
            H[2] = (H[2] + c) | 0;
            H[3] = (H[3] + d) | 0;
            H[4] = (H[4] + e) | 0;
            H[5] = (H[5] + f) | 0;
            H[6] = (H[6] + g) | 0;
            H[7] = (H[7] + h) | 0;
        },

        _doFinalize: function () {
            // Shortcuts
            var data = this._data;
            var dataWords = data.words;

            var nBitsTotal = this._nDataBytes * 8;
            var nBitsLeft = data.sigBytes * 8;

            // Add padding
            dataWords[nBitsLeft >>> 5] |= 0x80 << (24 - nBitsLeft % 32);
            dataWords[(((nBitsLeft + 64) >>> 9) << 4) + 14] = Math.floor(nBitsTotal / 0x100000000);
            dataWords[(((nBitsLeft + 64) >>> 9) << 4) + 15] = nBitsTotal;
            data.sigBytes = dataWords.length * 4;

            // Hash final blocks
            this._process();

            // Return final computed hash
            return this._hash;
        },

        clone: function () {
            var clone = Hasher.clone.call(this);
            clone._hash = this._hash.clone();

            return clone;
        }
    });

    /**
     * Shortcut function to the hasher's object interface.
     *
     * @param {WordArray|string} message The message to hash.
     *
     * @return {WordArray} The hash.
     *
     * @static
     *
     * @example
     *
     *     var hash = CryptoJS.SHA256('message');
     *     var hash = CryptoJS.SHA256(wordArray);
     */
    C.SHA256 = Hasher._createHelper(SHA256);

    /**
     * Shortcut function to the HMAC's object interface.
     *
     * @param {WordArray|string} message The message to hash.
     * @param {WordArray|string} key The secret key.
     *
     * @return {WordArray} The HMAC.
     *
     * @static
     *
     * @example
     *
     *     var hmac = CryptoJS.HmacSHA256(message, key);
     */
    C.HmacSHA256 = Hasher._createHmacHelper(SHA256);
}(Math));

exports.CryptoJS = C
module.exports = exports


},{"./core.js":17}],24:[function(require,module,exports){
exports.Face = require('./js/face.js').Face;
exports.NDN = require('./js/face.js').NDN; // deprecated
exports.Closure = require('./js/closure.js').Closure;
exports.Name = require('./js/name.js').Name;
exports.ForwardingFlags = require('./js/forwarding-flags.js').ForwardingFlags;
exports.Interest = require('./js/interest.js').Interest;
exports.Exclude = require('./js/exclude.js').Exclude;
exports.Data = require('./js/data.js').Data;
exports.ContentObject = require('./js/data.js').ContentObject; // deprecated
exports.ContentType = require('./js/meta-info.js').ContentType;
exports.MetaInfo = require('./js/meta-info.js').MetaInfo;
exports.SignedInfo = require('./js/meta-info.js').SignedInfo; // deprecated
exports.Sha256WithRsaSignature = require('./js/sha256-with-rsa-signature.js').Sha256WithRsaSignature;
exports.Signature = require('./js/sha256-with-rsa-signature.js').Signature; // deprecated
exports.Key = require('./js/key.js').Key;
exports.KeyLocator = require('./js/key-locator.js').KeyLocator;
exports.KeyName = require('./js/key-locator.js').KeyName;
exports.KeyLocatorType = require('./js/key-locator.js').KeyLocatorType;
exports.PublisherPublicKeyDigest = require('./js/publisher-public-key-digest.js').PublisherPublicKeyDigest;
exports.WireFormat = require('./js/encoding/wire-format.js').WireFormat;
exports.BinaryXmlWireFormat = require('./js/encoding/binary-xml-wire-format.js').BinaryXmlWireFormat;
exports.TlvWireFormat = require('./js/encoding/tlv-wire-format.js').TlvWireFormat;
exports.TcpTransport = require('./js/transport/tcp-transport.js').TcpTransport;
exports.UnixTransport = require('./js/transport/unix-transport.js').UnixTransport;
exports.DataUtils = require('./js/encoding/data-utils.js').DataUtils;
exports.EncodingUtils = require('./js/encoding/encoding-utils.js').EncodingUtils;
exports.ProtobufTlv = require('./js/encoding/protobuf-tlv.js').ProtobufTlv;
exports.Blob = require('./js/util/blob.js').Blob;
exports.NameEnumeration = require('./js/util/name-enumeration.js').NameEnumeration;
exports.MemoryContentCache = require('./js/util/memory-content-cache.js').MemoryContentCache;
exports.NDNTime = require('./js/util/ndn-time.js').NDNTime;
exports.globalKeyManager = require('./js/security/key-manager.js').globalKeyManager;
exports.SecurityException = require('./js/security/security-exception.js').SecurityException;
exports.KeyType = require('./js/security/security-types.js').KeyType;
exports.KeyClass = require('./js/security/security-types.js').KeyClass;
exports.DigestAlgorithm = require('./js/security/security-types.js').DigestAlgorithm;
exports.EncryptMode = require('./js/security/security-types.js').EncryptMode;
exports.IdentityStorage = require('./js/security/identity/identity-storage.js').IdentityStorage;
exports.MemoryIdentityStorage = require('./js/security/identity/memory-identity-storage.js').MemoryIdentityStorage;
exports.MemoryPrivateKeyStorage = require('./js/security/identity/memory-private-key-storage.js').MemoryPrivateKeyStorage;
exports.IdentityManager = require('./js/security/identity/identity-manager.js').IdentityManager;
exports.ValidationRequest = require('./js/security/policy/validation-request.js').ValidationRequest;
exports.PolicyManager = require('./js/security/policy/policy-manager.js').PolicyManager;
exports.NoVerifyPolicyManager = require('./js/security/policy/no-verify-policy-manager.js').NoVerifyPolicyManager;
exports.SelfVerifyPolicyManager = require('./js/security/policy/self-verify-policy-manager.js').SelfVerifyPolicyManager;
exports.KeyChain = require('./js/security/key-chain.js').KeyChain;

},{"./js/closure.js":27,"./js/data.js":28,"./js/encoding/binary-xml-wire-format.js":32,"./js/encoding/data-utils.js":33,"./js/encoding/encoding-utils.js":36,"./js/encoding/protobuf-tlv.js":37,"./js/encoding/tlv-wire-format.js":39,"./js/encoding/wire-format.js":44,"./js/exclude.js":45,"./js/face.js":47,"./js/forwarding-flags.js":49,"./js/interest.js":50,"./js/key-locator.js":51,"./js/key.js":52,"./js/meta-info.js":54,"./js/name.js":55,"./js/publisher-public-key-digest.js":57,"./js/security/identity/identity-manager.js":60,"./js/security/identity/identity-storage.js":61,"./js/security/identity/memory-identity-storage.js":62,"./js/security/identity/memory-private-key-storage.js":63,"./js/security/key-chain.js":65,"./js/security/key-manager.js":66,"./js/security/policy/no-verify-policy-manager.js":67,"./js/security/policy/policy-manager.js":68,"./js/security/policy/self-verify-policy-manager.js":69,"./js/security/policy/validation-request.js":70,"./js/security/security-exception.js":71,"./js/security/security-types.js":72,"./js/sha256-with-rsa-signature.js":73,"./js/transport/tcp-transport.js":25,"./js/transport/unix-transport.js":75,"./js/util/blob.js":77,"./js/util/memory-content-cache.js":79,"./js/util/name-enumeration.js":80,"./js/util/ndn-time.js":82}],25:[function(require,module,exports){
/**
 * Copyright (C) 2013-2014 Regents of the University of California.
 * @author: Jeff Thompson <jefft0@remap.ucla.edu>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 * A copy of the GNU General Public License is in the file COPYING.
 */

// The Face constructor uses TcpTransport by default which is not available in the browser, so override to WebSocketTransport.
exports.TcpTransport = require("./transport/web-socket-transport").WebSocketTransport;

},{"./transport/web-socket-transport":76}],26:[function(require,module,exports){
(function (Buffer){
/**
 * Copyright (C) 2013-2014 Regents of the University of California.
 * @author: Wentao Shang
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 * A copy of the GNU General Public License is in the file COPYING.
 */

var ASN1HEX = require('../contrib/securityLib/asn1hex-1.1.js').ASN1HEX
var KJUR = require('../contrib/securityLib/crypto-1.0.js').KJUR
var RSAKey = require('../contrib/securityLib/rsasign-1.2.js').RSAKey
var b64tohex = require('../contrib/securityLib/base64.js').b64tohex

// Library namespace
var ndn = ndn || {};
ndn.Key = require("./key.js").Key

var exports = ndn;


// Factory method to create hasher objects
exports.createHash = function(alg)
{
  if (alg != 'sha256')
    throw new Error('createHash: unsupported algorithm.');

  var obj = {};

  obj.md = new KJUR.crypto.MessageDigest({alg: "sha256", prov: "cryptojs"});

  obj.update = function(buf) {
    this.md.updateHex(buf.toString('hex'));
  };

  obj.digest = function() {
    return new Buffer(this.md.digest(), 'hex');
  };

  return obj;
};

// Factory method to create RSA signer objects
exports.createSign = function(alg)
{
  if (alg != 'RSA-SHA256')
    throw new Error('createSign: unsupported algorithm.');

  var obj = {};

  obj.arr = [];

  obj.update = function(buf) {
    this.arr.push(buf);
  };

  obj.sign = function(keypem) {
    var rsa = new RSAKey();
    rsa.readPrivateKeyFromPEMString(keypem);
    var signer = new KJUR.crypto.Signature({alg: "SHA256withRSA", prov: "cryptojs/jsrsa"});
    signer.initSign(rsa);
    for (var i = 0; i < this.arr.length; ++i)
      signer.updateHex(this.arr[i].toString('hex'));

    return new Buffer(signer.sign(), 'hex');
  };

  return obj;
};

// Factory method to create RSA verifier objects
exports.createVerify = function(alg)
{
  if (alg != 'RSA-SHA256')
    throw new Error('createSign: unsupported algorithm.');

  var obj = {};

  obj.arr = [];

  obj.update = function(buf) {
    this.arr.push(buf);
  };

  var getSubjectPublicKeyPosFromHex = function(hPub) {
    var a = ASN1HEX.getPosArrayOfChildren_AtObj(hPub, 0);
    if (a.length != 2)
      return -1;
    var pBitString = a[1];
    if (hPub.substring(pBitString, pBitString + 2) != '03')
      return -1;
    var pBitStringV = ASN1HEX.getStartPosOfV_AtObj(hPub, pBitString);
    if (hPub.substring(pBitStringV, pBitStringV + 2) != '00')
      return -1;
    return pBitStringV + 2;
  };

  var readPublicDER = function(pub_der) {
    var hex = pub_der.toString('hex');
    var p = getSubjectPublicKeyPosFromHex(hex);
    var a = ASN1HEX.getPosArrayOfChildren_AtObj(hex, p);
    if (a.length != 2)
      return null;
    var hN = ASN1HEX.getHexOfV_AtObj(hex, a[0]);
    var hE = ASN1HEX.getHexOfV_AtObj(hex, a[1]);
    var rsaKey = new RSAKey();
    rsaKey.setPublic(hN, hE);
    return rsaKey;
  };

  obj.verify = function(keypem, sig) {
    var key = new ndn.Key();
    key.fromPemString(keypem);

    var rsa = readPublicDER(key.publicToDER());
    var signer = new KJUR.crypto.Signature({alg: "SHA256withRSA", prov: "cryptojs/jsrsa"});
    signer.initVerifyByPublicKey(rsa);
    for (var i = 0; i < this.arr.length; i++)
      signer.updateHex(this.arr[i].toString('hex'));
    var hSig = sig.toString('hex');
    return signer.verify(hSig);
  };

  return obj;
};

exports.randomBytes = function(size)
{
  // TODO: Use a cryptographic random number generator.
  var result = new Buffer(size);
  for (var i = 0; i < size; ++i)
    result[i] = Math.floor(Math.random() * 256);
  return result;
};

// contrib/feross/buffer.js needs base64.toByteArray. Define it here so that
// we don't have to include the entire base64 module.
exports.toByteArray = function(str) {
  var hex = b64tohex(str);
  var result = [];
  hex.replace(/(..)/g, function(ss) {
    result.push(parseInt(ss, 16));
  });
  return result;
};

module.exports = exports
// After this we include contrib/feross/buffer.js to define the Buffer class.

}).call(this,require("buffer").Buffer)
},{"../contrib/securityLib/asn1hex-1.1.js":15,"../contrib/securityLib/base64.js":16,"../contrib/securityLib/crypto-1.0.js":18,"../contrib/securityLib/rsasign-1.2.js":22,"./key.js":52,"buffer":3}],27:[function(require,module,exports){
/**
 * Provide the callback closure for the async communication methods in the Face class.
 * Copyright (C) 2013-2014 Regents of the University of California.
 * @author: Jeff Thompson <jefft0@remap.ucla.edu>
 * This is a port of Closure.py from PyNDN, written by:
 * Derek Kulinski <takeda@takeda.tk>
 * Jeff Burke <jburke@ucla.edu>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 * A copy of the GNU General Public License is in the file COPYING.
 */

/**
 * A subclass of Closure is passed to expressInterest and registerPrefix.
 * @deprecated You should use the forms of expressInterest and registerPrefix which use callbacks instead of Closure.
 * @constructor
 */
var Closure = function Closure()
{
  // I don't think storing Face's closure is needed
  // and it creates a reference loop, as of now both
  // of those variables are never set -- Derek
  //
  // Use instance variables to return data to callback
  this.ndn_data = null;  // this holds the ndn_closure
  this.ndn_data_dirty = false;
};

exports.Closure = Closure;

// Upcall result
Closure.RESULT_ERR               = -1; // upcall detected an error
Closure.RESULT_OK                =  0; // normal upcall return
Closure.RESULT_REEXPRESS         =  1; // reexpress the same interest again
Closure.RESULT_INTEREST_CONSUMED =  2; // upcall claims to consume interest
Closure.RESULT_VERIFY            =  3; // force an unverified result to be verified
Closure.RESULT_FETCHKEY          =  4; // get the key in the key locator and re-call the interest
                                       //   with the key available in the local storage

// Upcall kind
Closure.UPCALL_FINAL              = 0; // handler is about to be deregistered
Closure.UPCALL_INTEREST           = 1; // incoming interest
Closure.UPCALL_CONSUMED_INTEREST  = 2; // incoming interest, someone has answered
Closure.UPCALL_CONTENT            = 3; // incoming verified content
Closure.UPCALL_INTEREST_TIMED_OUT = 4; // interest timed out
Closure.UPCALL_CONTENT_UNVERIFIED = 5; // content that has not been verified
Closure.UPCALL_CONTENT_BAD        = 6; // verification failed

/**
 * Override this in your subclass.
 * If you're getting strange errors in upcall()
 * check your code whether you're returning a value.
 */
Closure.prototype.upcall = function(kind, upcallInfo)
{
  //dump('upcall ' + this + " " + kind + " " + upcallInfo + "\n");
  return Closure.RESULT_OK;
};

/**
 * An UpcallInfo is passed to Closure.upcall.
 * @constructor
 */
var UpcallInfo = function UpcallInfo(face, interest, matchedComps, data)
{
  this.face = face;  // Face object (not used)
  this.ndn = face;   // deprecated
  this.interest = interest;  // Interest object
  this.matchedComps = matchedComps;  // int
  this.data = data;  // Data
  this.contentObject = data; // deprecated.  Include for backward compatibility.
};

UpcallInfo.prototype.toString = function()
{
  var ret = "face = " + this.face;
  ret += "\nInterest = " + this.interest;
  ret += "\nmatchedComps = " + this.matchedComps;
  ret += "\nData: " + this.data;
  return ret;
};

exports.UpcallInfo = UpcallInfo;

},{}],28:[function(require,module,exports){
(function (Buffer){
/**
 * This class represents an NDN Data object.
 * Copyright (C) 2013-2014 Regents of the University of California.
 * @author: Meki Cheraoui
 * @author: Jeff Thompson <jefft0@remap.ucla.edu>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 * A copy of the GNU General Public License is in the file COPYING.
 */

var cryptoJS = require("./crypto.js");
var Blob = require('./util/blob.js').Blob;
var SignedBlob = require('./util/signed-blob.js').SignedBlob;
var BinaryXMLEncoder = require('./encoding/binary-xml-encoder.js').BinaryXMLEncoder;
var NDNProtocolDTags = require('./util/ndn-protoco-id-tags.js').NDNProtocolDTags;
var DataUtils = require('./encoding/data-utils.js').DataUtils;
var Name = require('./name.js').Name;
var Sha256WithRsaSignature = require('./sha256-with-rsa-signature.js').Sha256WithRsaSignature;
var MetaInfo = require('./meta-info.js').MetaInfo;
var KeyLocator = require('./key-locator.js').KeyLocator;
var globalKeyManager = require('./security/key-manager.js').globalKeyManager;
var WireFormat = require('./encoding/wire-format.js').WireFormat;

/**
 * Create a new Data with the optional values.  There are 2 forms of constructor:
 * new Data([name] [, content]);
 * new Data(name, metaInfo [, content]);
 *
 * @constructor
 * @param {Name} name
 * @param {MetaInfo} metaInfo
 * @param {Buffer} content
 */
var Data = function Data(name, metaInfoOrContent, arg3)
{
  if (typeof name === 'string')
    this.name = new Name(name);
  else
    this.name = typeof name === 'object' && name instanceof Name ?
       new Name(name) : new Name();

  var metaInfo;
  var content;
  if (typeof metaInfoOrContent === 'object' &&
      metaInfoOrContent instanceof MetaInfo) {
    metaInfo = metaInfoOrContent;
    content = arg3;
  }
  else {
    metaInfo = null;
    content = metaInfoOrContent;
  }

  // Use signedInfo instead of metaInfo for backward compatibility.
  this.signedInfo = typeof metaInfo === 'object' && metaInfo instanceof MetaInfo ?
       new MetaInfo(metaInfo) : new MetaInfo();

  if (typeof content === 'string')
    this.content = DataUtils.toNumbersFromString(content);
  else if (typeof content === 'object' && content instanceof Blob)
    this.content = content.buf();
  else
    this.content = content;

  this.signature = new Sha256WithRsaSignature();

  this.wireEncoding = SignedBlob();
};

exports.Data = Data;

/**
 * Get the data packet's name.
 * @returns {Name} The name.
 */
Data.prototype.getName = function()
{
  return this.name;
};

/**
 * Get the data packet's meta info.
 * @returns {MetaInfo} The meta info.
 */
Data.prototype.getMetaInfo = function()
{
  return this.signedInfo;
};

/**
 * Get the data packet's signature object.
 * @returns {Signature} The signature object.
 */
Data.prototype.getSignature = function()
{
  return this.signature;
};

/**
 * Get the data packet's content.
 * @returns {Blob} The data packet content as a Blob.
 */
Data.prototype.getContent = function()
{
  // For temporary backwards compatibility, leave this.content as a Buffer but return a Blob.
  return new Blob(this.content, false);
};

/**
 * @deprecated Use getContent. This method returns a Buffer which is the former
 * behavior of getContent, and should only be used while updating your code.
 */
Data.prototype.getContentAsBuffer = function()
{
  return this.content;
};

/**
 * Set name to a copy of the given Name.
 * @param {Name} name The Name which is copied.
 * @returns {Data} This Data so that you can chain calls to update values.
 */
Data.prototype.setName = function(name)
{
  this.name = typeof name === 'object' && name instanceof Name ?
    new Name(name) : new Name();

  // The object has changed, so the wireEncoding is invalid.
  this.wireEncoding = SignedBlob();
  return this;
};

/**
 * Set metaInfo to a copy of the given MetaInfo.
 * @param {MetaInfo} metaInfo The MetaInfo which is copied.
 * @returns {Data} This Data so that you can chain calls to update values.
 */
Data.prototype.setMetaInfo = function(metaInfo)
{
  this.signedInfo = typeof metaInfo === 'object' && metaInfo instanceof MetaInfo ?
    new MetaInfo(metaInfo) : new MetaInfo();

  // The object has changed, so the wireEncoding is invalid.
  this.wireEncoding = SignedBlob();
  return this;
};

/**
 * Set the signature to a copy of the given signature.
 * @param {Signature} signature The signature object which is cloned.
 * @returns {Data} This Data so that you can chain calls to update values.
 */
Data.prototype.setSignature = function(signature)
{
  this.signature = typeof signature === 'object' && signature instanceof Sha256WithRsaSignature ?
    signature.clone() : new Sha256WithRsaSignature();

  // The object has changed, so the wireEncoding is invalid.
  this.wireEncoding = SignedBlob();
  return this;
};

/**
 * Set the content to the given value.
 * @param {type} content The array this is copied.
 * @returns {Data} This Data so that you can chain calls to update values.
 */
Data.prototype.setContent = function(content)
{
  if (typeof content === 'string')
    this.content = DataUtils.toNumbersFromString(content);
  else if (typeof content === 'object' && content instanceof Blob)
    this.content = content.buf();
  else
    this.content = new Buffer(content);

  // The object has changed, so the wireEncoding is invalid.
  this.wireEncoding = SignedBlob();
  return this;
};

Data.prototype.sign = function(wireFormat)
{
  wireFormat = (wireFormat || WireFormat.getDefaultWireFormat());

  if (this.getSignatureOrMetaInfoKeyLocator() == null ||
      this.getSignatureOrMetaInfoKeyLocator().getType() == null)
    this.getMetaInfo().setFields();

  if (this.wireEncoding == null || this.wireEncoding.isNull()) {
    // Need to encode to set wireEncoding.
    // Set an initial empty signature so that we can encode.
    this.getSignature().setSignature(new Buffer(128));
    this.wireEncode(wireFormat);
  }
  var rsa = cryptoJS.createSign('RSA-SHA256');
  rsa.update(this.wireEncoding.signedBuf());

  var sig = new Buffer
    (DataUtils.toNumbersIfString(rsa.sign(globalKeyManager.privateKey)));
  this.signature.setSignature(sig);
};

// The first time verify is called, it sets this to determine if a signature
//   buffer needs to be converted to a string for the crypto verifier.
Data.verifyUsesString = null;
Data.prototype.verify = function(/*Key*/ key)
{
  if (key == null || key.publicKeyPem == null)
    throw new Error('Cannot verify Data without a public key.');

  if (Data.verifyUsesString == null) {
    var hashResult = cryptoJS.createHash('sha256').digest();
    // If the has result is a string, we assume that this is a version of
    //   crypto where verify also uses a string signature.
    Data.verifyUsesString = (typeof hashResult === 'string');
  }

  if (this.wireEncoding == null || this.wireEncoding.isNull())
    // Need to encode to set wireEncoding.
    this.wireEncode();
  var verifier = cryptoJS.createVerify('RSA-SHA256');
  verifier.update(this.wireEncoding.signedBuf());
  var signatureBytes = Data.verifyUsesString ?
    DataUtils.toString(this.signature.getSignature().buf()) : this.signature.getSignature().buf();
  return verifier.verify(key.publicKeyPem, signatureBytes);
};

Data.prototype.getElementLabel = function() { return NDNProtocolDTags.Data; };

/**
 * Encode this Data for a particular wire format.
 * @param {WireFormat} wireFormat (optional) A WireFormat object used to encode
 * this object. If omitted, use WireFormat.getDefaultWireFormat().
 * @returns {SignedBlob} The encoded buffer in a SignedBlob object.
 */
Data.prototype.wireEncode = function(wireFormat)
{
  wireFormat = (wireFormat || WireFormat.getDefaultWireFormat());
  var result = wireFormat.encodeData(this);
  // TODO: Implement setDefaultWireEncoding with getChangeCount support.
  this.wireEncoding = new SignedBlob
    (result.encoding, result.signedPortionBeginOffset,
     result.signedPortionEndOffset);
  return this.wireEncoding;
};

/**
 * Decode the input using a particular wire format and update this Data.
 * @param {Blob|Buffer} input The buffer with the bytes to decode.
 * @param {WireFormat} wireFormat (optional) A WireFormat object used to decode
 * this object. If omitted, use WireFormat.getDefaultWireFormat().
 */
Data.prototype.wireDecode = function(input, wireFormat)
{
  wireFormat = (wireFormat || WireFormat.getDefaultWireFormat());
  // If input is a blob, get its buf().
  var decodeBuffer = typeof input === 'object' && input instanceof Blob ?
                     input.buf() : input;
  var result = wireFormat.decodeData(this, decodeBuffer);
  // TODO: Implement setDefaultWireEncoding with getChangeCount support.
  // In the Blob constructor, set copy true, but if input is already a Blob, it
  //   won't copy.
  this.wireEncoding = new SignedBlob
    (new Blob(input, true), result.signedPortionBeginOffset,
     result.signedPortionEndOffset);
};

/**
 * If getSignature() has a key locator, return it.  Otherwise, use
 * the key locator from getMetaInfo() for backward compatibility and print
 * a warning to console.log that the key locator has moved to the Signature
 * object.  If neither has a key locator, return an empty key locator.
 * When we stop supporting the key locator in MetaInfo, this function is not
 * necessary and we will just use the key locator in the Signature.
 * @returns {KeyLocator} The key locator to use.
 */
Data.prototype.getSignatureOrMetaInfoKeyLocator = function()
{
  if (this.signature != null && this.signature.getKeyLocator() != null &&
      this.signature.getKeyLocator().getType() != null &&
      this.signature.getKeyLocator().getType() >= 0)
    // The application is using the key locator in the correct object.
    return this.signature.getKeyLocator();

  if (this.signedInfo != null && this.signedInfo.locator != null &&
      this.signedInfo.locator.getType() != null &&
      this.signedInfo.locator.getType() >= 0) {
    console.log("WARNING: Temporarily using the key locator found in the MetaInfo - expected it in the Signature object.");
    console.log("WARNING: In the future, the key locator in the Signature object will not be supported.");
    return this.signedInfo.locator;
  }

  // Return the empty key locator from the Signature object if possible.
  if (this.signature != null && this.signature.getKeyLocator() != null)
    return this.signature.getKeyLocator();
  else
    return new KeyLocator();
}

// Since binary-xml-wire-format.js includes this file, put these at the bottom to avoid problems with cycles of require.
var BinaryXmlWireFormat = require('./encoding/binary-xml-wire-format.js').BinaryXmlWireFormat;

/**
 * @deprecated Use BinaryXmlWireFormat.decodeData.
 */
Data.prototype.from_ndnb = function(/*XMLDecoder*/ decoder)
{
  BinaryXmlWireFormat.decodeData(this, decoder);
};

/**
 * @deprecated Use BinaryXmlWireFormat.encodeData.
 */
Data.prototype.to_ndnb = function(/*XMLEncoder*/ encoder)
{
  BinaryXmlWireFormat.encodeData(this, encoder);
};

/**
 * @deprecated Use wireEncode.  If you need binary XML, use
 * wireEncode(BinaryXmlWireFormat.get()).
 */
Data.prototype.encode = function(wireFormat)
{
  wireFormat = (wireFormat || BinaryXmlWireFormat.get());
  return wireFormat.encodeData(this).buf();
};

/**
 * @deprecated Use wireDecode.  If you need binary XML, use
 * wireDecode(input, BinaryXmlWireFormat.get()).
 */
Data.prototype.decode = function(input, wireFormat)
{
  wireFormat = (wireFormat || BinaryXmlWireFormat.get());
  wireFormat.decodeData(this, input);
};

/**
 * @deprecated Use new Data.
 */
var ContentObject = function ContentObject(name, signedInfo, content)
{
  // Call the base constructor.
  Data.call(this, name, signedInfo, content);
}

ContentObject.prototype = new Data();

exports.ContentObject = ContentObject;

}).call(this,require("buffer").Buffer)
},{"./crypto.js":26,"./encoding/binary-xml-encoder.js":30,"./encoding/binary-xml-wire-format.js":32,"./encoding/data-utils.js":33,"./encoding/wire-format.js":44,"./key-locator.js":51,"./meta-info.js":54,"./name.js":55,"./security/key-manager.js":66,"./sha256-with-rsa-signature.js":73,"./util/blob.js":77,"./util/ndn-protoco-id-tags.js":81,"./util/signed-blob.js":83,"buffer":3}],29:[function(require,module,exports){
(function (Buffer){
/**
 * This class is used to decode ndnb binary elements (blob, type/value pairs).
 *
 * Copyright (C) 2013-2014 Regents of the University of California.
 * @author: Meki Cheraoui
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 * A copy of the GNU General Public License is in the file COPYING.
 */

var NDNProtocolDTags = require('../util/ndn-protoco-id-tags.js').NDNProtocolDTags;
var NDNTime = require('../util/ndn-time.js').NDNTime;
var DataUtils = require('./data-utils.js').DataUtils;
var DecodingException = require('./decoding-exception.js').DecodingException;
var LOG = require('../log.js').Log.LOG;

var XML_EXT = 0x00;

var XML_TAG = 0x01;

var XML_DTAG = 0x02;

var XML_ATTR = 0x03;

var XML_DATTR = 0x04;

var XML_BLOB = 0x05;

var XML_UDATA = 0x06;

var XML_CLOSE = 0x0;

var XML_SUBTYPE_PROCESSING_INSTRUCTIONS = 16;


var XML_TT_BITS = 3;
var XML_TT_MASK = ((1 << XML_TT_BITS) - 1);
var XML_TT_VAL_BITS = XML_TT_BITS + 1;
var XML_TT_VAL_MASK = ((1 << (XML_TT_VAL_BITS)) - 1);
var XML_REG_VAL_BITS = 7;
var XML_REG_VAL_MASK = ((1 << XML_REG_VAL_BITS) - 1);
var XML_TT_NO_MORE = (1 << XML_REG_VAL_BITS); // 0x80
var BYTE_MASK = 0xFF;
var LONG_BYTES = 8;
var LONG_BITS = 64;

var bits_11 = 0x0000007FF;
var bits_18 = 0x00003FFFF;
var bits_32 = 0x0FFFFFFFF;



//returns a string
tagToString = function(/*long*/ tagVal)
{
  if (tagVal >= 0 && tagVal < NDNProtocolDTagsStrings.length) {
    return NDNProtocolDTagsStrings[tagVal];
  }
  else if (tagVal == NDNProtocolDTags.NDNProtocolDataUnit) {
    return NDNProtocolDTags.NDNPROTOCOL_DATA_UNIT;
  }

  return null;
};

//returns a Long
stringToTag =  function(/*String*/ tagName)
{
  // the slow way, but right now we don't care.... want a static lookup for the forward direction
  for (var i=0; i < NDNProtocolDTagsStrings.length; ++i) {
    if (null != NDNProtocolDTagsStrings[i] && NDNProtocolDTagsStrings[i] == tagName)
      return i;
  }
  if (NDNProtocolDTags.NDNPROTOCOL_DATA_UNIT == tagName) {
    return NDNProtocolDTags.NDNProtocolDataUnit;
  }

  return null;
};

/**
 * @constructor
 */
var BinaryXMLDecoder = function BinaryXMLDecoder(input)
{
  var MARK_LEN=512;
  var DEBUG_MAX_LEN =  32768;

  this.input = input;
  this.offset = 0;
  // peekDTag sets and checks this, and readElementStartDTag uses it to avoid reading again.
  this.previouslyPeekedDTagStartOffset = -1;
};

exports.BinaryXMLDecoder = BinaryXMLDecoder;

/**
 * Decode the header from the input starting at its position, expecting the type to be DTAG and the value to be expectedTag.
   * Update the input's offset.
 * @param {number} expectedTag The expected value for DTAG.
 */
BinaryXMLDecoder.prototype.readElementStartDTag = function(expectedTag)
{
  if (this.offset == this.previouslyPeekedDTagStartOffset) {
    // peekDTag already decoded this DTag.
    if (this.previouslyPeekedDTag != expectedTag)
      throw new DecodingException(new Error("Did not get the expected DTAG " + expectedTag + ", got " + this.previouslyPeekedDTag));

    // Fast forward past the header.
    this.offset = this.previouslyPeekedDTagEndOffset;
  }
  else {
    var typeAndValue = this.decodeTypeAndVal();
    if (typeAndValue == null || typeAndValue.type() != XML_DTAG)
      throw new DecodingException(new Error("Header type is not a DTAG"));

    if (typeAndValue.val() != expectedTag)
      throw new DecodingException(new Error("Expected start element: " + expectedTag + " got: " + typeAndValue.val()));
  }
};

/**
 * @deprecated Use readElementStartDTag. Binary XML string tags and attributes are not used by any NDN encodings and
 * support is not maintained in the code base.
 */
BinaryXMLDecoder.prototype.readStartElement = function(
    //String
    startTag,
    //TreeMap<String, String>
    attributes)
{
  //TypeAndVal
  var tv = this.decodeTypeAndVal();

  if (null == tv)
    throw new DecodingException(new Error("Expected start element: " + startTag + " got something not a tag."));

  //String
  var decodedTag = null;

  if (tv.type() == XML_TAG) {
    // Tag value represents length-1 as tags can never be empty.
    var valval;

    if (typeof tv.val() == 'string')
      valval = (parseInt(tv.val())) + 1;
    else
      valval = (tv.val())+ 1;

    decodedTag = this.decodeUString(valval);
  }
  else if (tv.type() == XML_DTAG)
    decodedTag = tv.val();

  if (null ==  decodedTag || decodedTag != startTag) {
    console.log('expecting '+ startTag + ' but got '+ decodedTag);
    throw new DecodingException(new Error("Expected start element: " + startTag + " got: " + decodedTag + "(" + tv.val() + ")"));
  }

  // DKS: does not read attributes out of stream if caller doesn't
  // ask for them. Should possibly peek and skip over them regardless.
  // TODO: fix this
  if (null != attributes)
    readAttributes(attributes);
};

/**
 * @deprecated Binary XML string tags and attributes are not used by any NDN encodings and support is not maintained in the code base.
 */
BinaryXMLDecoder.prototype.readAttributes = function(
  // array of [attributeName, attributeValue]
  attributes)
{
  if (null == attributes)
    return;

  try {
    // Now need to get attributes.
    //TypeAndVal
    var nextTV = this.peekTypeAndVal();

    while (null != nextTV && (XML_ATTR == nextTV.type() || XML_DATTR == nextTV.type())) {
      // Decode this attribute. First, really read the type and value.
      //this.TypeAndVal
      var thisTV = this.decodeTypeAndVal();

      //String
      var attributeName = null;
      if (XML_ATTR == thisTV.type()) {
        // Tag value represents length-1 as attribute names cannot be empty.
        var valval ;
        if (typeof thisTV.val() == 'string')
          valval = (parseInt(thisTV.val())) + 1;
        else
          valval = (thisTV.val())+ 1;

        attributeName = this.decodeUString(valval);
      }
      else if (XML_DATTR == thisTV.type()) {
        // DKS TODO are attributes same or different dictionary?
        attributeName = tagToString(thisTV.val());
        if (null == attributeName)
          throw new DecodingException(new Error("Unknown DATTR value" + thisTV.val()));
      }

      // Attribute values are always UDATA
      //String
      var attributeValue = this.decodeUString();

      attributes.push([attributeName, attributeValue]);
      nextTV = this.peekTypeAndVal();
    }
  }
  catch (e) {
    throw new DecodingException(new Error("readStartElement", e));
  }
};

/**
 * @deprecated Use peekDTag.  Binary XML string tags and attributes are not used by any NDN encodings and
 * support is not maintained in the code base.
 */
BinaryXMLDecoder.prototype.peekStartElementAsString = function()
{
  //String
  var decodedTag = null;
  var previousOffset = this.offset;
  try {
    // Have to distinguish genuine errors from wrong tags. Could either use
    // a special exception subtype, or redo the work here.
    //this.TypeAndVal
    var tv = this.decodeTypeAndVal();

    if (null != tv) {
      if (tv.type() == XML_TAG) {
        // Tag value represents length-1 as tags can never be empty.
        var valval ;
        if (typeof tv.val() == 'string')
          valval = (parseInt(tv.val())) + 1;
        else
          valval = (tv.val())+ 1;

        decodedTag = this.decodeUString(valval);
      }
      else if (tv.type() == XML_DTAG)
        decodedTag = tagToString(tv.val());
    } // else, not a type and val, probably an end element. rewind and return false.
  }
  catch (e) {
  }
  finally {
    try {
      this.offset = previousOffset;
    }
    catch (e) {
      Log.logStackTrace(Log.FAC_ENCODING, Level.WARNING, e);
      throw new DecodingException(new Error("Cannot reset stream! " + e.getMessage(), e));
    }
  }

  return decodedTag;
};

/**
 * Decode the header from the input starting at its position, and if it is a DTAG where the value is the expectedTag,
 * then set return true.  Do not update the input's offset.
 * @param {number} expectedTag The expected value for DTAG.
 * @returns {boolean} True if the tag is the expected tag, otherwise false.
 */
BinaryXMLDecoder.prototype.peekDTag = function(expectedTag)
{
  if (this.offset == this.previouslyPeekedDTagStartOffset)
    // We already decoded this DTag.
    return this.previouslyPeekedDTag == expectedTag;
  else {
    // First check if it is an element close (which cannot be the expected tag).
    if (this.input[this.offset] == XML_CLOSE)
      return false;

    var saveOffset = this.offset;
    var typeAndValue = this.decodeTypeAndVal();
    // readElementStartDTag will use this to fast forward.
    this.previouslyPeekedDTagEndOffset = this.offset;
    // Restore the position.
    this.offset = saveOffset;

    if (typeAndValue != null && typeAndValue.type() == XML_DTAG) {
      this.previouslyPeekedDTagStartOffset = saveOffset;
      this.previouslyPeekedDTag = typeAndValue.val();

      return typeAndValue.val() == expectedTag;
    }
    else
      return false;
  }
};

/**
 * @deprecated Use peekDTag.  Binary XML string tags and attributes are not used by any NDN encodings and
 * support is not maintained in the code base.
 */
BinaryXMLDecoder.prototype.peekStartElement = function(
    //String
    startTag)
{
  //String
  if (typeof startTag == 'string') {
    var decodedTag = this.peekStartElementAsString();

    if (null !=  decodedTag && decodedTag == startTag)
      return true;

    return false;
  }
  else if (typeof startTag == 'number') {
    var decodedTag = this.peekStartElementAsLong();
    if (null !=  decodedTag && decodedTag == startTag)
      return true;

    return false;
  }
  else
    throw new DecodingException(new Error("SHOULD BE STRING OR NUMBER"));
};

/**
 * @deprecated Use peekDTag.  Binary XML string tags and attributes are not used by any NDN encodings and
 * support is not maintained in the code base.
 */
BinaryXMLDecoder.prototype.peekStartElementAsLong = function()
{
  //Long
  var decodedTag = null;
  var previousOffset = this.offset;

  try {
    // Have to distinguish genuine errors from wrong tags. Could either use
    // a special exception subtype, or redo the work here.
    //this.TypeAndVal
    var tv = this.decodeTypeAndVal();

    if (null != tv) {
      if (tv.type() == XML_TAG) {
        if (tv.val() + 1 > DEBUG_MAX_LEN)
          throw new DecodingException(new Error("Decoding error: length " + tv.val()+1 + " longer than expected maximum length!"));

        var valval;
        if (typeof tv.val() == 'string')
          valval = (parseInt(tv.val())) + 1;
        else
          valval = (tv.val())+ 1;

        // Tag value represents length-1 as tags can never be empty.
        //String
        var strTag = this.decodeUString(valval);

        decodedTag = stringToTag(strTag);
      }
      else if (tv.type() == XML_DTAG)
        decodedTag = tv.val();
    } // else, not a type and val, probably an end element. rewind and return false.

  }
  catch (e) {
  }
  finally {
    try {
      //this.input.reset();
      this.offset = previousOffset;
    } catch (e) {
      Log.logStackTrace(Log.FAC_ENCODING, Level.WARNING, e);
      throw new Error("Cannot reset stream! " + e.getMessage(), e);
    }
  }

  return decodedTag;
};

/**
 * Decode the header from the input starting its offset, expecting the type to be DTAG and the value to be expectedTag.
 * Then read one item of any type (presumably BLOB, UDATA, TAG or ATTR) and return a
 * Buffer. However, if allowNull is true, then the item may be absent.
 * Finally, read the element close.  Update the input's offset.
 * @param {number} expectedTag The expected value for DTAG.
 * @param {boolean} allowNull True if the binary item may be missing.
 * @returns {Buffer} A Buffer which is a slice on the data inside the input buffer. However,
 * if allowNull is true and the binary data item is absent, then return null.
 */
BinaryXMLDecoder.prototype.readBinaryDTagElement = function(expectedTag, allowNull)
{
  this.readElementStartDTag(expectedTag);
  return this.readBlob(allowNull);
};

/**
 * @deprecated Use readBinaryDTagElement.  Binary XML string tags and attributes are not used by any NDN encodings and
 * support is not maintained in the code base.
 */
BinaryXMLDecoder.prototype.readBinaryElement = function(
    //long
    startTag,
    //TreeMap<String, String>
    attributes,
    //boolean
    allowNull)
{
  this.readStartElement(startTag, attributes);
  return this.readBlob(allowNull);
};

/**
 * Read one byte from the input starting at its offset, expecting it to be the element close.
 * Update the input's offset.
 */
BinaryXMLDecoder.prototype.readElementClose = function()
{
  var next = this.input[this.offset++];
  if (next != XML_CLOSE)
    throw new DecodingException(new Error("Expected end element, got: " + next));
};

/**
 * @deprecated Use readElementClose.
 */
BinaryXMLDecoder.prototype.readEndElement = function()
{
  if (LOG > 4) console.log('this.offset is '+this.offset);

  var next = this.input[this.offset];

  this.offset++;

  if (LOG > 4) console.log('XML_CLOSE IS '+XML_CLOSE);
  if (LOG > 4) console.log('next is '+next);

  if (next != XML_CLOSE) {
    console.log("Expected end element, got: " + next);
    throw new DecodingException(new Error("Expected end element, got: " + next));
  }
};

//String
BinaryXMLDecoder.prototype.readUString = function()
{
  //String
  var ustring = this.decodeUString();
  this.readElementClose();
  return ustring;
};

/**
 * Read a blob as well as the end element. Returns a Buffer (or null for missing blob).
 * If the blob is missing and allowNull is false (default), throw an exception.  Otherwise,
 *   just read the end element and return null.
 */
BinaryXMLDecoder.prototype.readBlob = function(allowNull)
{
  if (this.input[this.offset] == XML_CLOSE && allowNull) {
    this.readElementClose();
    return null;
  }

  var blob = this.decodeBlob();
  this.readElementClose();
  return blob;
};

/**
 * Decode the header from the input starting at its offset, expecting the type to be
 * DTAG and the value to be expectedTag.  Then read one item, parse it as an unsigned
 * big endian integer in 4096 ticks per second, and convert it to and NDNTime object.
 * Finally, read the element close.  Update the input's offset.
 * @param {number} expectedTag The expected value for DTAG.
 * @returns {NDNTime} The dateTime value.
 */
BinaryXMLDecoder.prototype.readDateTimeDTagElement = function(expectedTag)
{
  var byteTimestamp = this.readBinaryDTagElement(expectedTag);
  byteTimestamp = DataUtils.toHex(byteTimestamp);
  byteTimestamp = parseInt(byteTimestamp, 16);

  var lontimestamp = (byteTimestamp/ 4096) * 1000;

  var timestamp = new NDNTime(lontimestamp);
  if (null == timestamp)
    throw new DecodingException(new Error("Cannot parse timestamp: " + DataUtils.printHexBytes(byteTimestamp)));

  return timestamp;
};

/**
 * @deprecated Use readDateTimeDTagElement.  Binary XML string tags and attributes are not used by any NDN encodings and
 * support is not maintained in the code base.
 */
BinaryXMLDecoder.prototype.readDateTime = function(
  //long
  startTag)
{
  var byteTimestamp = this.readBinaryElement(startTag);
  byteTimestamp = DataUtils.toHex(byteTimestamp);
  byteTimestamp = parseInt(byteTimestamp, 16);

  var lontimestamp = (byteTimestamp/ 4096) * 1000;

  if (LOG > 4) console.log('DECODED DATE WITH VALUE');
  if (LOG > 4) console.log(lontimestamp);

  //NDNTime
  var timestamp = new NDNTime(lontimestamp);
  if (null == timestamp)
    throw new DecodingException(new Error("Cannot parse timestamp: " + DataUtils.printHexBytes(byteTimestamp)));

  return timestamp;
};

BinaryXMLDecoder.prototype.decodeTypeAndVal = function()
{

  /*int*/ var type = -1;
  /*long*/ var val = 0;
  /*boolean*/ var more = true;

  do {
    var next = this.input[this.offset ];
    if (next == null)
      // Quit the loop.
      return null;

    if (next < 0)
      return null;

    if (0 == next && 0 == val)
      return null;

    more = (0 == (next & XML_TT_NO_MORE));

    if  (more) {
      val = val << XML_REG_VAL_BITS;
      val |= (next & XML_REG_VAL_MASK);
    }
    else {
      type = next & XML_TT_MASK;
      val = val << XML_TT_VAL_BITS;
      val |= ((next >>> XML_TT_BITS) & XML_TT_VAL_MASK);
    }

    this.offset++;
  } while (more);

  if (LOG > 4) console.log('TYPE is '+ type + ' VAL is '+ val);

  return new TypeAndVal(type, val);
};

//TypeAndVal
BinaryXMLDecoder.prototype.peekTypeAndVal = function()
{
  //TypeAndVal
  var tv = null;
  var previousOffset = this.offset;

  try {
    tv = this.decodeTypeAndVal();
  }
  finally {
    this.offset = previousOffset;
  }

  return tv;
};

//Buffer
BinaryXMLDecoder.prototype.decodeBlob = function(
    //int
    blobLength)
{
  if (null == blobLength) {
    //TypeAndVal
    var tv = this.decodeTypeAndVal();

    var valval ;
    if (typeof tv.val() == 'string')
      valval = (parseInt(tv.val()));
    else
      valval = (tv.val());

    return this.decodeBlob(valval);
  }

  //Buffer
  var bytes = new Buffer(this.input.slice(this.offset, this.offset+ blobLength));
  this.offset += blobLength;

  return bytes;
};

//String
BinaryXMLDecoder.prototype.decodeUString = function(
    //int
    byteLength)
{
  if (null == byteLength) {
    var tempStreamPosition = this.offset;

    //TypeAndVal
    var tv = this.decodeTypeAndVal();

    if (LOG > 4) console.log('TV is '+tv);
    if (LOG > 4) console.log(tv);

    if (LOG > 4) console.log('Type of TV is '+typeof tv);

    // if we just have closers left, will get back null
    if (null == tv || XML_UDATA != tv.type()) {
      this.offset = tempStreamPosition;
      return "";
    }

    return this.decodeUString(tv.val());
  }
  else {
    //Buffer
    var stringBytes = this.decodeBlob(byteLength);

    // TODO: Should this parse as UTF8?
    return DataUtils.toString(stringBytes);
  }
};

//OBject containg a pair of type and value
var TypeAndVal = function TypeAndVal(_type,_val)
{
  this.t = _type;
  this.v = _val;
};

TypeAndVal.prototype.type = function()
{
  return this.t;
};

TypeAndVal.prototype.val = function()
{
  return this.v;
};

/**
 * Decode the header from the input starting its offset, expecting the type to be DTAG and the value to be expectedTag.
 * Then read one UDATA item, parse it as a decimal integer and return the integer. Finally, read the element close.  Update the input's offset.
 * @param {number} expectedTag The expected value for DTAG.
 * @returns {number} The parsed integer.
 */
BinaryXMLDecoder.prototype.readIntegerDTagElement = function(expectedTag)
{
  return parseInt(this.readUTF8DTagElement(expectedTag));
};

/**
 * @deprecated Use readIntegerDTagElement.  Binary XML string tags and attributes are not used by any NDN encodings and
 * support is not maintained in the code base.
 */
BinaryXMLDecoder.prototype.readIntegerElement = function(
  //String
  startTag)
{
  //String
  if (LOG > 4) console.log('READING INTEGER '+ startTag);
  if (LOG > 4) console.log('TYPE OF '+ typeof startTag);

  var strVal = this.readUTF8Element(startTag);

  return parseInt(strVal);
};

/**
 * Decode the header from the input starting its offset, expecting the type to be DTAG and the value to be expectedTag.
 * Then read one UDATA item and return a string. Finally, read the element close.  Update the input's offset.
 * @param {number} expectedTag The expected value for DTAG.
 * @returns {string} The UDATA string.
 */
BinaryXMLDecoder.prototype.readUTF8DTagElement = function(expectedTag)
{
  this.readElementStartDTag(expectedTag);
  return this.readUString();;
};

/**
 * @deprecated Use readUTF8DTagElement.  Binary XML string tags and attributes are not used by any NDN encodings and
 * support is not maintained in the code base.
 */
BinaryXMLDecoder.prototype.readUTF8Element = function(
    //String
    startTag,
    //TreeMap<String, String>
    attributes)
{
  //throws Error where name == "DecodingException"

  // can't use getElementText, can't get attributes
  this.readStartElement(startTag, attributes);
  //String
  var strElementText = this.readUString();
  return strElementText;
};

/**
 * Set the offset into the input, used for the next read.
 * @param {number} offset The new offset.
 */
BinaryXMLDecoder.prototype.seek = function(offset)
{
  this.offset = offset;
};

}).call(this,require("buffer").Buffer)
},{"../log.js":53,"../util/ndn-protoco-id-tags.js":81,"../util/ndn-time.js":82,"./data-utils.js":33,"./decoding-exception.js":34,"buffer":3}],30:[function(require,module,exports){
/**
 * This class is used to encode ndnb binary elements (blob, type/value pairs).
 *
 * Copyright (C) 2013-2014 Regents of the University of California.
 * @author: Meki Cheraoui
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 * A copy of the GNU General Public License is in the file COPYING.
 */

var LOG = require('../log.js').Log.LOG;

var NDNProtocolDTags = require('../util/ndn-protoco-id-tags.js').NDNProtocolDTags;
var DynamicBuffer = require('../util/dynamic-buffer.js').DynamicBuffer;
var DataUtils = require('./data-utils.js').DataUtils;
var LOG = require('../log.js').Log.LOG;

var XML_EXT = 0x00;

var XML_TAG = 0x01;

var XML_DTAG = 0x02;

var XML_ATTR = 0x03;

var XML_DATTR = 0x04;

var XML_BLOB = 0x05;

var XML_UDATA = 0x06;

var XML_CLOSE = 0x0;

var XML_SUBTYPE_PROCESSING_INSTRUCTIONS = 16;


var XML_TT_BITS = 3;
var XML_TT_MASK = ((1 << XML_TT_BITS) - 1);
var XML_TT_VAL_BITS = XML_TT_BITS + 1;
var XML_TT_VAL_MASK = ((1 << (XML_TT_VAL_BITS)) - 1);
var XML_REG_VAL_BITS = 7;
var XML_REG_VAL_MASK = ((1 << XML_REG_VAL_BITS) - 1);
var XML_TT_NO_MORE = (1 << XML_REG_VAL_BITS); // 0x80
var BYTE_MASK = 0xFF;
var LONG_BYTES = 8;
var LONG_BITS = 64;

var bits_11 = 0x0000007FF;
var bits_18 = 0x00003FFFF;
var bits_32 = 0x0FFFFFFFF;

/**
 * @constructor
 */
var BinaryXMLEncoder = function BinaryXMLEncoder(initiaLength)
{
  if (!initiaLength)
    initiaLength = 16;

  this.ostream = new DynamicBuffer(initiaLength);
  this.offset = 0;
  this.CODEC_NAME = "Binary";
};

exports.BinaryXMLEncoder = BinaryXMLEncoder;

/**
 * Encode utf8Content as utf8 and write to the output buffer as a UDATA.
 * @param {string} utf8Content The string to convert to utf8.
 */
BinaryXMLEncoder.prototype.writeUString = function(utf8Content)
{
  this.encodeUString(utf8Content, XML_UDATA);
};

BinaryXMLEncoder.prototype.writeBlob = function(
    /*Buffer*/ binaryContent)
{
  if (LOG >3) console.log(binaryContent);

  this.encodeBlob(binaryContent, binaryContent.length);
};

/**
 * Write an element start header using DTAG with the tag to the output buffer.
 * @param {number} tag The DTAG tag.
 */
BinaryXMLEncoder.prototype.writeElementStartDTag = function(tag)
{
  this.encodeTypeAndVal(XML_DTAG, tag);
};

/**
 * @deprecated Use writeElementStartDTag.  Binary XML string tags and attributes are not used by any NDN encodings and
 * support is not maintained in the code base.
 */
BinaryXMLEncoder.prototype.writeStartElement = function(
  /*String*/ tag,
  /*TreeMap<String,String>*/ attributes)
{
  /*Long*/ var dictionaryVal = tag; //stringToTag(tag);

  if (null == dictionaryVal)
    this.encodeUString(tag, XML_TAG);
  else
    this.encodeTypeAndVal(XML_DTAG, dictionaryVal);

  if (null != attributes)
    this.writeAttributes(attributes);
};

/**
 * Write an element close to the output buffer.
 */
BinaryXMLEncoder.prototype.writeElementClose = function()
{
  this.ostream.ensureLength(this.offset + 1);
  this.ostream.array[this.offset] = XML_CLOSE;
  this.offset += 1;
};

/**
 * @deprecated Use writeElementClose.
 */
BinaryXMLEncoder.prototype.writeEndElement = function()
{
  this.writeElementClose();
};

/**
 * @deprecated Binary XML string tags and attributes are not used by any NDN encodings and support is not maintained in the code base.
 */
BinaryXMLEncoder.prototype.writeAttributes = function(/*TreeMap<String,String>*/ attributes)
{
  if (null == attributes)
    return;

  // the keySet of a TreeMap is sorted.

  for (var i = 0; i< attributes.length;i++) {
    var strAttr = attributes[i].k;
    var strValue = attributes[i].v;

    var dictionaryAttr = stringToTag(strAttr);
    if (null == dictionaryAttr)
      // not in dictionary, encode as attr
      // compressed format wants length of tag represented as length-1
      // to save that extra bit, as tag cannot be 0 length.
      // encodeUString knows to do that.
      this.encodeUString(strAttr, XML_ATTR);
    else
      this.encodeTypeAndVal(XML_DATTR, dictionaryAttr);

    // Write value
    this.encodeUString(strValue);
  }
};

//returns a string
stringToTag = function(/*long*/ tagVal)
{
  if (tagVal >= 0 && tagVal < NDNProtocolDTagsStrings.length)
    return NDNProtocolDTagsStrings[tagVal];
  else if (tagVal == NDNProtocolDTags.NDNProtocolDataUnit)
    return NDNProtocolDTags.NDNPROTOCOL_DATA_UNIT;

  return null;
};

//returns a Long
tagToString =  function(/*String*/ tagName)
{
  // the slow way, but right now we don't care.... want a static lookup for the forward direction
  for (var i = 0; i < NDNProtocolDTagsStrings.length; ++i) {
    if (null != NDNProtocolDTagsStrings[i] && NDNProtocolDTagsStrings[i] == tagName)
      return i;
  }

  if (NDNProtocolDTags.NDNPROTOCOL_DATA_UNIT == tagName)
    return NDNProtocolDTags.NDNProtocolDataUnit;

  return null;
};

/**
 * Write an element start header using DTAG with the tag to the output buffer, then the content as explained below,
 * then an element close.
 * @param {number} tag The DTAG tag.
 * @param {number|string|Buffer} content If contentis a number, convert it to a string and call writeUString.  If content is a string,
 * call writeUString.  Otherwise, call writeBlob.
 */
BinaryXMLEncoder.prototype.writeDTagElement = function(tag, content)
{
  this.writeElementStartDTag(tag);

  if (typeof content === 'number')
    this.writeUString(content.toString());
  else if (typeof content === 'string')
    this.writeUString(content);
  else
    this.writeBlob(content);

  this.writeElementClose();
};

/**
 * @deprecated Use writeDTagElement.  Binary XML string tags and attributes are not used by any NDN encodings and
 * support is not maintained in the code base.
 * If Content is a string, then encode as utf8 and write UDATA.
 */
BinaryXMLEncoder.prototype.writeElement = function(
    //long
    tag,
    //byte[]
    Content,
    //TreeMap<String, String>
    attributes)
{
  this.writeStartElement(tag, attributes);
  // Will omit if 0-length

  if (typeof Content === 'number') {
    if (LOG > 4) console.log('GOING TO WRITE THE NUMBER .charCodeAt(0) ' + Content.toString().charCodeAt(0));
    if (LOG > 4) console.log('GOING TO WRITE THE NUMBER ' + Content.toString());
    if (LOG > 4) console.log('type of number is ' + typeof Content.toString());

    this.writeUString(Content.toString());
  }
  else if (typeof Content === 'string') {
    if (LOG > 4) console.log('GOING TO WRITE THE STRING  ' + Content);
    if (LOG > 4) console.log('type of STRING is ' + typeof Content);

    this.writeUString(Content);
  }
  else {
    if (LOG > 4) console.log('GOING TO WRITE A BLOB  ' + Content);

    this.writeBlob(Content);
  }

  this.writeElementClose();
};

var TypeAndVal = function TypeAndVal(_type,_val)
{
  this.type = _type;
  this.val = _val;
};

BinaryXMLEncoder.prototype.encodeTypeAndVal = function(
    //int
    type,
    //long
    val)
{
  if (LOG > 4) console.log('Encoding type '+ type+ ' and value '+ val);

  if (LOG > 4) console.log('OFFSET IS ' + this.offset);

  if (type > XML_UDATA || type < 0 || val < 0)
    throw new Error("Tag and value must be positive, and tag valid.");

  // Encode backwards. Calculate how many bytes we need:
  var numEncodingBytes = this.numEncodingBytes(val);
  this.ostream.ensureLength(this.offset + numEncodingBytes);

  // Bottom 4 bits of val go in last byte with tag.
  this.ostream.array[this.offset + numEncodingBytes - 1] =
    //(byte)
      (BYTE_MASK &
          (((XML_TT_MASK & type) |
           ((XML_TT_VAL_MASK & val) << XML_TT_BITS))) |
           XML_TT_NO_MORE); // set top bit for last byte
  val = val >>> XML_TT_VAL_BITS;

  // Rest of val goes into preceding bytes, 7 bits per byte, top bit
  // is "more" flag.
  var i = this.offset + numEncodingBytes - 2;
  while (0 != val && i >= this.offset) {
    this.ostream.array[i] = //(byte)
        (BYTE_MASK & (val & XML_REG_VAL_MASK)); // leave top bit unset
    val = val >>> XML_REG_VAL_BITS;
    --i;
  }

  if (val != 0)
    throw new Error("This should not happen: miscalculated encoding");

  this.offset+= numEncodingBytes;

  return numEncodingBytes;
};

/**
 * Encode ustring as utf8.
 */
BinaryXMLEncoder.prototype.encodeUString = function(
    //String
    ustring,
    //byte
    type)
{
  if (null == ustring)
    return;
  if (type == XML_TAG || type == XML_ATTR && ustring.length == 0)
    return;

  if (LOG > 3) console.log("The string to write is ");
  if (LOG > 3) console.log(ustring);

  var strBytes = DataUtils.stringToUtf8Array(ustring);

  this.encodeTypeAndVal(type,
            (((type == XML_TAG) || (type == XML_ATTR)) ?
                (strBytes.length-1) :
                strBytes.length));

  if (LOG > 3) console.log("THE string to write is ");

  if (LOG > 3) console.log(strBytes);

  this.writeString(strBytes);
  this.offset+= strBytes.length;
};


BinaryXMLEncoder.prototype.encodeBlob = function(
    //Buffer
    blob,
    //int
    length)
{
  if (null == blob)
    return;

  if (LOG > 4) console.log('LENGTH OF XML_BLOB IS '+length);

  this.encodeTypeAndVal(XML_BLOB, length);
  this.writeBlobArray(blob);
  this.offset += length;
};

var ENCODING_LIMIT_1_BYTE = ((1 << (XML_TT_VAL_BITS)) - 1);
var ENCODING_LIMIT_2_BYTES = ((1 << (XML_TT_VAL_BITS + XML_REG_VAL_BITS)) - 1);
var ENCODING_LIMIT_3_BYTES = ((1 << (XML_TT_VAL_BITS + 2 * XML_REG_VAL_BITS)) - 1);

BinaryXMLEncoder.prototype.numEncodingBytes = function(
    //long
    x)
{
  if (x <= ENCODING_LIMIT_1_BYTE) return (1);
  if (x <= ENCODING_LIMIT_2_BYTES) return (2);
  if (x <= ENCODING_LIMIT_3_BYTES) return (3);

  var numbytes = 1;

  // Last byte gives you XML_TT_VAL_BITS
  // Remainder each give you XML_REG_VAL_BITS
  x = x >>> XML_TT_VAL_BITS;
  while (x != 0) {
        numbytes++;
    x = x >>> XML_REG_VAL_BITS;
  }
  return (numbytes);
};

/**
 * Write an element start header using DTAG with the tag to the output buffer, then the dateTime
   * as a big endian BLOB converted to 4096 ticks per second, then an element close.
 * @param {number} tag The DTAG tag.
 * @param {NDNTime} dateTime
 */
BinaryXMLEncoder.prototype.writeDateTimeDTagElement = function(tag, dateTime)
{
  //parse to hex
  var binarydate =  Math.round((dateTime.msec/1000) * 4096).toString(16)  ;
  if (binarydate.length % 2 == 1)
    binarydate = '0' + binarydate;

  this.writeDTagElement(tag, DataUtils.toNumbers(binarydate));
};

/**
 * @deprecated Use writeDateTimeDTagElement.  Binary XML string tags and attributes are not used by any NDN encodings and
 * support is not maintained in the code base.
 */
BinaryXMLEncoder.prototype.writeDateTime = function(
    //String
    tag,
    //NDNTime
    dateTime)
{
  //parse to hex
  var binarydate =  Math.round((dateTime.msec/1000) * 4096).toString(16)  ;
  if (binarydate.length % 2 == 1)
    binarydate = '0' + binarydate;

  this.writeElement(tag, DataUtils.toNumbers(binarydate));
};

// This does not update this.offset.
BinaryXMLEncoder.prototype.writeString = function(input)
{
  if (typeof input === 'string') {
    if (LOG > 4) console.log('GOING TO WRITE A STRING');
    if (LOG > 4) console.log(input);

    this.ostream.ensureLength(this.offset + input.length);
    for (var i = 0; i < input.length; i++) {
      if (LOG > 4) console.log('input.charCodeAt(i)=' + input.charCodeAt(i));
      this.ostream.array[this.offset + i] = (input.charCodeAt(i));
    }
  }
  else
  {
    if (LOG > 4) console.log('GOING TO WRITE A STRING IN BINARY FORM');
    if (LOG > 4) console.log(input);

    this.writeBlobArray(input);
  }
};

BinaryXMLEncoder.prototype.writeBlobArray = function(
    //Buffer
    blob)
{
  if (LOG > 4) console.log('GOING TO WRITE A BLOB');

  this.ostream.copy(blob, this.offset);
};

BinaryXMLEncoder.prototype.getReducedOstream = function()
{
  return this.ostream.slice(0, this.offset);
};

},{"../log.js":53,"../util/dynamic-buffer.js":78,"../util/ndn-protoco-id-tags.js":81,"./data-utils.js":33}],31:[function(require,module,exports){
/**
 * This class uses BinaryXMLDecoder to follow the structure of a ndnb binary element to
 * determine its end.
 *
 * Copyright (C) 2013-2014 Regents of the University of California.
 * @author: Jeff Thompson <jefft0@remap.ucla.edu>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 * A copy of the GNU General Public License is in the file COPYING.
 */

var BinaryXMLDecoder = require('./binary-xml-decoder.js').BinaryXMLDecoder;
var DynamicBuffer = require('../util/dynamic-buffer.js').DynamicBuffer;

var XML_EXT = 0x00;
var XML_TAG = 0x01;
var XML_DTAG = 0x02;
var XML_ATTR = 0x03;
var XML_DATTR = 0x04;
var XML_BLOB = 0x05;
var XML_UDATA = 0x06;
var XML_CLOSE = 0x0;

var XML_SUBTYPE_PROCESSING_INSTRUCTIONS = 16;

var XML_TT_BITS = 3;
var XML_TT_MASK = ((1 << XML_TT_BITS) - 1);
var XML_TT_VAL_BITS = XML_TT_BITS + 1;
var XML_TT_VAL_MASK = ((1 << (XML_TT_VAL_BITS)) - 1);
var XML_REG_VAL_BITS = 7;
var XML_REG_VAL_MASK = ((1 << XML_REG_VAL_BITS) - 1);
var XML_TT_NO_MORE = (1 << XML_REG_VAL_BITS); // 0x80

/**
 * @constructor
 */
var BinaryXMLStructureDecoder = function BinaryXMLDecoder()
{
  this.gotElementEnd = false;
  this.offset = 0;
  this.level = 0;
  this.state = BinaryXMLStructureDecoder.READ_HEADER_OR_CLOSE;
  this.headerLength = 0;
  this.useHeaderBuffer = false;
  this.headerBuffer = new DynamicBuffer(5);
  this.nBytesToRead = 0;
};

exports.BinaryXMLStructureDecoder = BinaryXMLStructureDecoder;

BinaryXMLStructureDecoder.READ_HEADER_OR_CLOSE = 0;
BinaryXMLStructureDecoder.READ_BYTES = 1;

/**
 * Continue scanning input starting from this.offset.  If found the end of the element
 *   which started at offset 0 then return true, else false.
 * If this returns false, you should read more into input and call again.
 * You have to pass in input each time because the array could be reallocated.
 * This throws an exception for badly formed ndnb.
 */
BinaryXMLStructureDecoder.prototype.findElementEnd = function(
  // Buffer
  input)
{
  if (this.gotElementEnd)
    // Someone is calling when we already got the end.
    return true;

  var decoder = new BinaryXMLDecoder(input);

  while (true) {
    if (this.offset >= input.length)
      // All the cases assume we have some input.
      return false;

    switch (this.state) {
      case BinaryXMLStructureDecoder.READ_HEADER_OR_CLOSE:
        // First check for XML_CLOSE.
        if (this.headerLength == 0 && input[this.offset] == XML_CLOSE) {
          ++this.offset;
          // Close the level.
          --this.level;
          if (this.level == 0) {
            // Finished.
            this.gotElementEnd = true;
            return true;
          }
          if (this.level < 0)
            throw new Error("BinaryXMLStructureDecoder: Unexpected close tag at offset " + (this.offset - 1));

          // Get ready for the next header.
          this.startHeader();
          break;
        }

        var startingHeaderLength = this.headerLength;
        while (true) {
          if (this.offset >= input.length) {
            // We can't get all of the header bytes from this input. Save in headerBuffer.
            this.useHeaderBuffer = true;
            var nNewBytes = this.headerLength - startingHeaderLength;
            this.headerBuffer.copy(input.slice(this.offset - nNewBytes, nNewBytes), startingHeaderLength);

            return false;
          }
          var headerByte = input[this.offset++];
          ++this.headerLength;
          if (headerByte & XML_TT_NO_MORE)
            // Break and read the header.
            break;
        }

        var typeAndVal;
        if (this.useHeaderBuffer) {
          // Copy the remaining bytes into headerBuffer.
          nNewBytes = this.headerLength - startingHeaderLength;
          this.headerBuffer.copy(input.slice(this.offset - nNewBytes, nNewBytes), startingHeaderLength);

          typeAndVal = new BinaryXMLDecoder(this.headerBuffer.array).decodeTypeAndVal();
        }
        else {
          // We didn't have to use the headerBuffer.
          decoder.seek(this.offset - this.headerLength);
          typeAndVal = decoder.decodeTypeAndVal();
        }

        if (typeAndVal == null)
          throw new Error("BinaryXMLStructureDecoder: Can't read header starting at offset " +
                          (this.offset - this.headerLength));

        // Set the next state based on the type.
        var type = typeAndVal.t;
        if (type == XML_DATTR)
          // We already consumed the item. READ_HEADER_OR_CLOSE again.
          // ndnb has rules about what must follow an attribute, but we are just scanning.
          this.startHeader();
        else if (type == XML_DTAG || type == XML_EXT) {
          // Start a new level and READ_HEADER_OR_CLOSE again.
          ++this.level;
          this.startHeader();
        }
        else if (type == XML_TAG || type == XML_ATTR) {
          if (type == XML_TAG)
            // Start a new level and read the tag.
            ++this.level;
          // Minimum tag or attribute length is 1.
          this.nBytesToRead = typeAndVal.v + 1;
          this.state = BinaryXMLStructureDecoder.READ_BYTES;
          // ndnb has rules about what must follow an attribute, but we are just scanning.
        }
        else if (type == XML_BLOB || type == XML_UDATA) {
          this.nBytesToRead = typeAndVal.v;
          this.state = BinaryXMLStructureDecoder.READ_BYTES;
        }
        else
          throw new Error("BinaryXMLStructureDecoder: Unrecognized header type " + type);
        break;

      case BinaryXMLStructureDecoder.READ_BYTES:
        var nRemainingBytes = input.length - this.offset;
        if (nRemainingBytes < this.nBytesToRead) {
          // Need more.
          this.offset += nRemainingBytes;
          this.nBytesToRead -= nRemainingBytes;
          return false;
        }
        // Got the bytes.  Read a new header or close.
        this.offset += this.nBytesToRead;
        this.startHeader();
        break;

      default:
        // We don't expect this to happen.
        throw new Error("BinaryXMLStructureDecoder: Unrecognized state " + this.state);
    }
  }
};

/**
 * Set the state to READ_HEADER_OR_CLOSE and set up to start reading the header
 */
BinaryXMLStructureDecoder.prototype.startHeader = function()
{
  this.headerLength = 0;
  this.useHeaderBuffer = false;
  this.state = BinaryXMLStructureDecoder.READ_HEADER_OR_CLOSE;
};

/**
 *  Set the offset into the input, used for the next read.
 */
BinaryXMLStructureDecoder.prototype.seek = function(offset)
{
  this.offset = offset;
};

},{"../util/dynamic-buffer.js":78,"./binary-xml-decoder.js":29}],32:[function(require,module,exports){
/**
 * Copyright (C) 2013-2014 Regents of the University of California.
 * @author: Jeff Thompson <jefft0@remap.ucla.edu>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 * A copy of the GNU General Public License is in the file COPYING.
 */

var Blob = require('../util/blob.js').Blob;
var NDNProtocolDTags = require('../util/ndn-protoco-id-tags.js').NDNProtocolDTags;
var BinaryXMLEncoder = require('./binary-xml-encoder.js').BinaryXMLEncoder;
var BinaryXMLDecoder = require('./binary-xml-decoder.js').BinaryXMLDecoder;
var WireFormat = require('./wire-format.js').WireFormat;
var Name = require('../name.js').Name;
var Exclude = require('../exclude.js').Exclude;
var Sha256WithRsaSignature = require('../sha256-with-rsa-signature.js').Sha256WithRsaSignature;
var MetaInfo = require('../meta-info.js').MetaInfo;
var PublisherPublicKeyDigest = require('../publisher-public-key-digest.js').PublisherPublicKeyDigest;
var DataUtils = require('./data-utils.js').DataUtils;
var KeyLocatorType = require('../key-locator.js').KeyLocatorType;

/**
 * A BinaryXmlWireFormat implements the WireFormat interface for encoding and decoding in binary XML.
 * @constructor
 */
var BinaryXmlWireFormat = function BinaryXmlWireFormat()
{
  // Inherit from WireFormat.
  WireFormat.call(this);
};

exports.BinaryXmlWireFormat = BinaryXmlWireFormat;

// Default object.
BinaryXmlWireFormat.instance = null;

/**
 * Encode interest as Binary XML and return the encoding.
 * @param {Interest} interest The Interest to encode.
 * @returns {Blob} A Blob containing the encoding.
 */
BinaryXmlWireFormat.prototype.encodeInterest = function(interest)
{
  var encoder = new BinaryXMLEncoder();
  BinaryXmlWireFormat.encodeInterest(interest, encoder);
  return new Blob(encoder.getReducedOstream(), false);
};

/**
 * Decode input as a Binary XML interest and set the fields of the interest object.
 * @param {Interest} interest The Interest object whose fields are updated.
 * @param {Buffer} input The buffer with the bytes to decode.
 */
BinaryXmlWireFormat.prototype.decodeInterest = function(interest, input)
{
  var decoder = new BinaryXMLDecoder(input);
  BinaryXmlWireFormat.decodeInterest(interest, decoder);
};

/**
 * Encode data as Binary XML and return the encoding and signed offsets.
 * @param {Data} data The Data object to encode.
 * @returns {object} An associative array with fields
 * (encoding, signedPortionBeginOffset, signedPortionEndOffset) where encoding
 * is a Blob containing the encoding, signedPortionBeginOffset is the offset in
 * the encoding of the beginning of the signed portion, and
 * signedPortionEndOffset is the offset in the encoding of the end of the
 * signed portion.
 */
BinaryXmlWireFormat.prototype.encodeData = function(data)
{
  var encoder = new BinaryXMLEncoder(1500);
  var result = BinaryXmlWireFormat.encodeData(data, encoder);
  result.encoding = new Blob(encoder.getReducedOstream(), false);
  return result;
};

/**
 * @deprecated Use encodeData(data).
 */
BinaryXmlWireFormat.prototype.encodeContentObject = function(data)
{
  return this.encodeData(data);
};

/**
 * Decode input as a Binary XML data packet, set the fields in the data object, and return
 * the signed offsets.
 * @param {Data} data The Data object whose fields are updated.
 * @param {Buffer} input The buffer with the bytes to decode.
 * @returns {object} An associative array with fields
 * (signedPortionBeginOffset, signedPortionEndOffset) where
 * signedPortionBeginOffset is the offset in the encoding of the beginning of
 * the signed portion, and signedPortionEndOffset is the offset in the encoding
 * of the end of the signed portion.
 */
BinaryXmlWireFormat.prototype.decodeData = function(data, input)
{
  var decoder = new BinaryXMLDecoder(input);
  return BinaryXmlWireFormat.decodeData(data, decoder);
};

/**
 * @deprecated Use decodeData(data, input).
 */
BinaryXmlWireFormat.prototype.decodeContentObject = function(data, input)
{
  this.decodeData(data, input);
};

/**
 * Get a singleton instance of a BinaryXmlWireFormat.  Assuming that the default
 * wire format was set with
 * WireFormat.setDefaultWireFormat(BinaryXmlWireFormat.get()), you can check if
 * this is the default wire encoding with
 * if WireFormat.getDefaultWireFormat() == BinaryXmlWireFormat.get().
 * @returns {BinaryXmlWireFormat} The singleton instance.
 */
BinaryXmlWireFormat.get = function()
{
  if (BinaryXmlWireFormat.instance === null)
    BinaryXmlWireFormat.instance = new BinaryXmlWireFormat();
  return BinaryXmlWireFormat.instance;
};

/**
 * Encode the interest by calling the operations on the encoder.
 * @param {Interest} interest
 * @param {BinaryXMLEncoder} encoder
 */
BinaryXmlWireFormat.encodeInterest = function(interest, encoder)
{
  encoder.writeElementStartDTag(NDNProtocolDTags.Interest);

  interest.getName().to_ndnb(encoder);

  if (null != interest.getMinSuffixComponents())
    encoder.writeDTagElement(NDNProtocolDTags.MinSuffixComponents, interest.getMinSuffixComponents());

  if (null != interest.getMaxSuffixComponents())
    encoder.writeDTagElement(NDNProtocolDTags.MaxSuffixComponents, interest.getMaxSuffixComponents());

  if (interest.getKeyLocator().getType() == KeyLocatorType.KEY_LOCATOR_DIGEST &&
      !interest.getKeyLocator().getKeyData().isNull() &&
      interest.getKeyLocator().getKeyData().size() > 0)
    // There is a KEY_LOCATOR_DIGEST. Use this instead of the publisherPublicKeyDigest.
    encoder.writeDTagElement
      (NDNProtocolDTags.PublisherPublicKeyDigest,
       interest.getKeyLocator().getKeyData());
  else {
    if (null != interest.publisherPublicKeyDigest)
      interest.publisherPublicKeyDigest.to_ndnb(encoder);
  }

  if (null != interest.getExclude())
    interest.getExclude().to_ndnb(encoder);

  if (null != interest.getChildSelector())
    encoder.writeDTagElement(NDNProtocolDTags.ChildSelector, interest.getChildSelector());

  if (interest.DEFAULT_ANSWER_ORIGIN_KIND != interest.setAnswerOriginKind() && interest.setAnswerOriginKind()!=null)
    encoder.writeDTagElement(NDNProtocolDTags.AnswerOriginKind, interest.setAnswerOriginKind());

  if (null != interest.setScope())
    encoder.writeDTagElement(NDNProtocolDTags.Scope, interest.setScope());

  if (null != interest.getInterestLifetimeMilliseconds())
    encoder.writeDTagElement(NDNProtocolDTags.InterestLifetime,
                DataUtils.nonNegativeIntToBigEndian((interest.getInterestLifetimeMilliseconds() / 1000.0) * 4096));

  if (interest.getNonce().size() > 0)
    encoder.writeDTagElement(NDNProtocolDTags.Nonce, interest.getNonce());

  encoder.writeElementClose();
};

/**
 * Use the decoder to place the result in interest.
 * @param {Interest} interest
 * @param {BinaryXMLDecoder} decoder
 */
BinaryXmlWireFormat.decodeInterest = function(interest, decoder)
{
  decoder.readElementStartDTag(NDNProtocolDTags.Interest);

  interest.setName(new Name());
  interest.getName().from_ndnb(decoder);

  if (decoder.peekDTag(NDNProtocolDTags.MinSuffixComponents))
    interest.setMinSuffixComponents(decoder.readIntegerDTagElement(NDNProtocolDTags.MinSuffixComponents));
  else
    interest.setMinSuffixComponents(null);

  if (decoder.peekDTag(NDNProtocolDTags.MaxSuffixComponents))
    interest.setMaxSuffixComponents(decoder.readIntegerDTagElement(NDNProtocolDTags.MaxSuffixComponents));
  else
    interest.setMaxSuffixComponents(null);

  // Initially clear the keyLocator.
  interest.getKeyLocator().clear();
  if (decoder.peekDTag(NDNProtocolDTags.PublisherPublicKeyDigest)) {
    interest.publisherPublicKeyDigest = new PublisherPublicKeyDigest();
    interest.publisherPublicKeyDigest.from_ndnb(decoder);
  }
  else
    interest.publisherPublicKeyDigest = null;
  if (interest.publisherPublicKeyDigest != null &&
      interest.publisherPublicKeyDigest.publisherPublicKeyDigest != null &&
      interest.publisherPublicKeyDigest.publisherPublicKeyDigest.length > 0) {
    // We keep the deprecated publisherPublicKeyDigest for backwards
    //   compatibility.  Also set the key locator.
    interest.getKeyLocator().setType(KeyLocatorType.KEY_LOCATOR_DIGEST);
    interest.getKeyLocator().setKeyData
      (interest.publisherPublicKeyDigest.publisherPublicKeyDigest);
  }

  if (decoder.peekDTag(NDNProtocolDTags.Exclude)) {
    interest.setExclude(new Exclude());
    interest.getExclude().from_ndnb(decoder);
  }
  else
    interest.setExclude(new Exclude());

  if (decoder.peekDTag(NDNProtocolDTags.ChildSelector))
    interest.setChildSelector(decoder.readIntegerDTagElement(NDNProtocolDTags.ChildSelector));
  else
    interest.setChildSelector(null);

  if (decoder.peekDTag(NDNProtocolDTags.AnswerOriginKind))
    interest.setAnswerOriginKind(decoder.readIntegerDTagElement(NDNProtocolDTags.AnswerOriginKind));
  else
    interest.setAnswerOriginKind(null);

  if (decoder.peekDTag(NDNProtocolDTags.Scope))
    interest.setScope(decoder.readIntegerDTagElement(NDNProtocolDTags.Scope));
  else
    interest.setScope(null);

  if (decoder.peekDTag(NDNProtocolDTags.InterestLifetime))
    interest.setInterestLifetimeMilliseconds(1000.0 * DataUtils.bigEndianToUnsignedInt
               (decoder.readBinaryDTagElement(NDNProtocolDTags.InterestLifetime)) / 4096);
  else
    interest.setInterestLifetimeMilliseconds(null);

  if (decoder.peekDTag(NDNProtocolDTags.Nonce))
    interest.setNonce(decoder.readBinaryDTagElement(NDNProtocolDTags.Nonce));
  else
    interest.setNonce(null);

  decoder.readElementClose();
};

/**
 * Encode the data by calling the operations on the encoder.
 * @param {Data} data
 * @param {BinaryXMLEncoder} encoder
 * @returns {object} An associative array with fields
 * (signedPortionBeginOffset, signedPortionEndOffset) where
 * signedPortionBeginOffset is the offset in the encoding of the beginning of
 * the signed portion, and signedPortionEndOffset is the offset in the encoding
 * of the end of the signed portion.
 */
BinaryXmlWireFormat.encodeData = function(data, encoder)
{
  //TODO verify name, MetaInfo and Signature is present
  encoder.writeElementStartDTag(data.getElementLabel());

  if (null != data.getSignature())
    data.getSignature().to_ndnb(encoder);

  var signedPortionBeginOffset = encoder.offset;

  if (null != data.getName())
    data.getName().to_ndnb(encoder);

  if (null != data.getMetaInfo())
    // Use getSignatureOrMetaInfoKeyLocator for the transition of moving
    //   the key locator from the MetaInfo to the Signauture object.
    data.getMetaInfo().to_ndnb(encoder, data.getSignatureOrMetaInfoKeyLocator());

  encoder.writeDTagElement(NDNProtocolDTags.Content, data.getContent().buf());

  var signedPortionEndOffset = encoder.offset;

  encoder.writeElementClose();

  return { signedPortionBeginOffset: signedPortionBeginOffset,
           signedPortionEndOffset: signedPortionEndOffset };
};

/**
 * Use the decoder to place the result in data.
 * @param {Data} data
 * @param {BinaryXMLDecoder} decoder
 * @returns {object} An associative array with fields
 * (signedPortionBeginOffset, signedPortionEndOffset) where
 * signedPortionBeginOffset is the offset in the encoding of the beginning of
 * the signed portion, and signedPortionEndOffset is the offset in the encoding
 * of the end of the signed portion.
 */
BinaryXmlWireFormat.decodeData = function(data, decoder)
{
  // TODO VALIDATE THAT ALL FIELDS EXCEPT SIGNATURE ARE PRESENT
  decoder.readElementStartDTag(data.getElementLabel());

  if (decoder.peekDTag(NDNProtocolDTags.Signature)) {
    data.setSignature(new Sha256WithRsaSignature());
    data.getSignature().from_ndnb(decoder);
  }
  else
    data.setSignature(new Sha256WithRsaSignature());

  var signedPortionBeginOffset = decoder.offset;

  data.setName(new Name());
  data.getName().from_ndnb(decoder);

  if (decoder.peekDTag(NDNProtocolDTags.SignedInfo)) {
    data.setMetaInfo(new MetaInfo());
    data.getMetaInfo().from_ndnb(decoder);
    if (data.getMetaInfo().locator != null && data.getSignature() != null)
      // Copy the key locator pointer to the Signature object for the transition
      //   of moving the key locator from the MetaInfo to the Signature object.
      data.getSignature().setKeyLocator(data.getMetaInfo().locator);
  }
  else
    data.setMetaInfo(new MetaInfo());

  data.setContent(decoder.readBinaryDTagElement(NDNProtocolDTags.Content, true));

  var signedPortionEndOffset = decoder.offset;

  decoder.readElementClose();

  return { signedPortionBeginOffset: signedPortionBeginOffset,
           signedPortionEndOffset: signedPortionEndOffset };
};

},{"../exclude.js":45,"../key-locator.js":51,"../meta-info.js":54,"../name.js":55,"../publisher-public-key-digest.js":57,"../sha256-with-rsa-signature.js":73,"../util/blob.js":77,"../util/ndn-protoco-id-tags.js":81,"./binary-xml-decoder.js":29,"./binary-xml-encoder.js":30,"./data-utils.js":33,"./wire-format.js":44}],33:[function(require,module,exports){
(function (Buffer){
/**
 * This class contains utilities to help parse the data
 *
 * Copyright (C) 2013-2014 Regents of the University of California.
 * @author: Meki Cheraoui
 * @author: Jeff Thompson <jefft0@remap.ucla.edu>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 * A copy of the GNU General Public License is in the file COPYING.
 */

/**
 * A DataUtils has static methods for converting data.
 * @constructor
 */
var DataUtils = {};

exports.DataUtils = DataUtils;

/*
 * NOTE THIS IS CURRENTLY NOT BEING USED
 *
 */

DataUtils.keyStr = "ABCDEFGHIJKLMNOP" +
                   "QRSTUVWXYZabcdef" +
                   "ghijklmnopqrstuv" +
                   "wxyz0123456789+/" +
                   "=";

/**
 * Raw String to Base 64
 */
DataUtils.stringtoBase64 = function stringtoBase64(input)
{
   //input = escape(input);
   var output = "";
   var chr1, chr2, chr3 = "";
   var enc1, enc2, enc3, enc4 = "";
   var i = 0;

   do {
    chr1 = input.charCodeAt(i++);
    chr2 = input.charCodeAt(i++);
    chr3 = input.charCodeAt(i++);

    enc1 = chr1 >> 2;
    enc2 = ((chr1 & 3) << 4) | (chr2 >> 4);
    enc3 = ((chr2 & 15) << 2) | (chr3 >> 6);
    enc4 = chr3 & 63;

    if (isNaN(chr2))
       enc3 = enc4 = 64;
    else if (isNaN(chr3))
       enc4 = 64;

    output = output +
       DataUtils.keyStr.charAt(enc1) +
       DataUtils.keyStr.charAt(enc2) +
       DataUtils.keyStr.charAt(enc3) +
       DataUtils.keyStr.charAt(enc4);
    chr1 = chr2 = chr3 = "";
    enc1 = enc2 = enc3 = enc4 = "";
   } while (i < input.length);

   return output;
};

/**
 * Base 64 to Raw String
 */
DataUtils.base64toString = function base64toString(input)
{
  var output = "";
  var chr1, chr2, chr3 = "";
  var enc1, enc2, enc3, enc4 = "";
  var i = 0;

  // remove all characters that are not A-Z, a-z, 0-9, +, /, or =
  var base64test = /[^A-Za-z0-9\+\/\=]/g;
  /* Test for invalid characters. */
  if (base64test.exec(input)) {
    alert("There were invalid base64 characters in the input text.\n" +
          "Valid base64 characters are A-Z, a-z, 0-9, '+', '/',and '='\n" +
          "Expect errors in decoding.");
  }

  input = input.replace(/[^A-Za-z0-9\+\/\=]/g, "");

  do {
    enc1 = DataUtils.keyStr.indexOf(input.charAt(i++));
    enc2 = DataUtils.keyStr.indexOf(input.charAt(i++));
    enc3 = DataUtils.keyStr.indexOf(input.charAt(i++));
    enc4 = DataUtils.keyStr.indexOf(input.charAt(i++));

    chr1 = (enc1 << 2) | (enc2 >> 4);
    chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
    chr3 = ((enc3 & 3) << 6) | enc4;

    output = output + String.fromCharCode(chr1);

    if (enc3 != 64)
      output = output + String.fromCharCode(chr2);

    if (enc4 != 64)
      output = output + String.fromCharCode(chr3);

    chr1 = chr2 = chr3 = "";
    enc1 = enc2 = enc3 = enc4 = "";
  } while (i < input.length);

  return output;
};

/**
 * Buffer to Hex String
 */
DataUtils.toHex = function(buffer)
{
  return buffer.toString('hex');
};

/**
 * Raw string to hex string.
 */
DataUtils.stringToHex = function(args)
{
  var ret = "";
  for (var i = 0; i < args.length; ++i) {
    var value = args.charCodeAt(i);
    ret += (value < 16 ? "0" : "") + value.toString(16);
  }
  return ret;
};

/**
 * Buffer to raw string.
 */
DataUtils.toString = function(buffer)
{
  return buffer.toString('binary');
};

/**
 * Hex String to Buffer.
 */
DataUtils.toNumbers = function(str)
{
  return new Buffer(str, 'hex');
};

/**
 * Hex String to raw string.
 */
DataUtils.hexToRawString = function(str)
{
  if (typeof str =='string') {
  var ret = "";
  str.replace(/(..)/g, function(s) {
    ret += String.fromCharCode(parseInt(s, 16));
  });
  return ret;
  }
};

/**
 * Raw String to Buffer.
 */
DataUtils.toNumbersFromString = function(str)
{
  return new Buffer(str, 'binary');
};

/**
 * If value is a string, then interpret it as a raw string and convert to
 * a Buffer. Otherwise assume it is a Buffer or array type and just return it.
 * @param {string|any} value
 * @returns {Buffer}
 */
DataUtils.toNumbersIfString = function(value)
{
  if (typeof value === 'string')
    return new Buffer(value, 'binary');
  else
    return value;
};

/**
 * Encode str as utf8 and return as Buffer.
 */
DataUtils.stringToUtf8Array = function(str)
{
  return new Buffer(str, 'utf8');
};

/**
 * arrays is an array of Buffer. Return a new Buffer which is the concatenation of all.
 */
DataUtils.concatArrays = function(arrays)
{
  return Buffer.concat(arrays);
};

// TODO: Take Buffer and use TextDecoder when available.
DataUtils.decodeUtf8 = function(utftext)
{
  var string = "";
  var i = 0;
  var c = 0;
    var c1 = 0;
    var c2 = 0;

  while (i < utftext.length) {
    c = utftext.charCodeAt(i);

    if (c < 128) {
      string += String.fromCharCode(c);
      i++;
    }
    else if (c > 191 && c < 224) {
      c2 = utftext.charCodeAt(i + 1);
      string += String.fromCharCode(((c & 31) << 6) | (c2 & 63));
      i += 2;
    }
    else {
      c2 = utftext.charCodeAt(i+1);
      var c3 = utftext.charCodeAt(i+2);
      string += String.fromCharCode(((c & 15) << 12) | ((c2 & 63) << 6) | (c3 & 63));
      i += 3;
    }
  }

  return string;
};

/**
 * Return true if a1 and a2 are the same length with equal elements.
 */
DataUtils.arraysEqual = function(a1, a2)
{
  // A simple sanity check that it is an array.
  if (!a1.slice)
    throw new Error("DataUtils.arraysEqual: a1 is not an array");
  if (!a2.slice)
    throw new Error("DataUtils.arraysEqual: a2 is not an array");

  if (a1.length != a2.length)
    return false;

  for (var i = 0; i < a1.length; ++i) {
    if (a1[i] != a2[i])
      return false;
  }

  return true;
};

/**
 * Convert the big endian Buffer to an unsigned int.
 * Don't check for overflow.
 */
DataUtils.bigEndianToUnsignedInt = function(bytes)
{
  var result = 0;
  for (var i = 0; i < bytes.length; ++i) {
    result <<= 8;
    result += bytes[i];
  }
  return result;
};

/**
 * Convert the int value to a new big endian Buffer and return.
 * If value is 0 or negative, return new Buffer(0).
 */
DataUtils.nonNegativeIntToBigEndian = function(value)
{
  value = Math.round(value);
  if (value <= 0)
    return new Buffer(0);

  // Assume value is not over 64 bits.
  var size = 8;
  var result = new Buffer(size);
  var i = 0;
  while (value != 0) {
    ++i;
    result[size - i] = value & 0xff;
    value >>= 8;
  }
  return result.slice(size - i, size);
};

/**
 * Modify array to randomly shuffle the elements.
 */
DataUtils.shuffle = function(array)
{
  for (var i = array.length - 1; i >= 1; --i) {
    // j is from 0 to i.
    var j = Math.floor(Math.random() * (i + 1));
    var temp = array[i];
    array[i] = array[j];
    array[j] = temp;
  }
};

}).call(this,require("buffer").Buffer)
},{"buffer":3}],34:[function(require,module,exports){
/**
 * Copyright (C) 2014 Regents of the University of California.
 * @author: Jeff Thompson <jefft0@remap.ucla.edu>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 * A copy of the GNU General Public License is in the file COPYING.
 */

/**
 * Create a new DecodingException wrapping the given error object.
 * Call with: throw new DecodingException(new Error("message")).
 * @constructor
 * @param {Error} error The exception created with new Error.
 */
function DecodingException(error)
{
  this.message = error.message;
  // Copy lineNumber, etc. from where new Error was called.
  for (var prop in error)
      this[prop] = error[prop];
}
DecodingException.prototype = new Error();
DecodingException.prototype.name = "DecodingException";

exports.DecodingException = DecodingException;

},{}],35:[function(require,module,exports){
/**
 * Copyright (C) 2013-2014 Regents of the University of California.
 * @author: Jeff Thompson <jefft0@remap.ucla.edu>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 * A copy of the GNU General Public License is in the file COPYING.
 */

var DataUtils = require('./data-utils.js').DataUtils;
var BinaryXMLStructureDecoder = require('./binary-xml-structure-decoder.js').BinaryXMLStructureDecoder;
var Tlv = require('./tlv/tlv.js').Tlv;
var TlvStructureDecoder = require('./tlv/tlv-structure-decoder.js').TlvStructureDecoder;
var LOG = require('../log.js').Log.LOG;

/**
 * A ElementReader lets you call onReceivedData multiple times which uses a
 * BinaryXMLStructureDecoder or TlvStructureDecoder to detect the end of a
 * binary XML or TLV element and calls elementListener.onReceivedElement(element)
 * with the element.  This handles the case where a single call to
 * onReceivedData may contain multiple elements.
 * @constructor
 * @param {{onReceivedElement:function}} elementListener
 */
var ElementReader = function ElementReader(elementListener)
{
  this.elementListener = elementListener;
  this.dataParts = [];
  this.binaryXmlStructureDecoder = new BinaryXMLStructureDecoder();
  this.tlvStructureDecoder = new TlvStructureDecoder();
  this.useTlv = null;
};

exports.ElementReader = ElementReader;

ElementReader.prototype.onReceivedData = function(/* Buffer */ data)
{
  // Process multiple objects in the data.
  while (true) {
    if (this.dataParts.length == 0) {
      // This is the beginning of an element.  Check whether it is binaryXML or TLV.
      if (data.length <= 0)
        // Wait for more data.
        return;

      // The type codes for TLV Interest and Data packets are chosen to not
      //   conflict with the first byte of a binary XML packet, so we can
      //   just look at the first byte.
      if (data[0] == Tlv.Interest || data[0] == Tlv.Data || data[0] == 0x80)
        this.useTlv = true;
      else
        // Binary XML.
        this.useTlv = false;
    }

    var gotElementEnd;
    var offset;
    if (this.useTlv) {
      // Scan the input to check if a whole TLV object has been read.
      this.tlvStructureDecoder.seek(0);
      gotElementEnd = this.tlvStructureDecoder.findElementEnd(data);
      offset = this.tlvStructureDecoder.getOffset();
    }
    else {
      // Scan the input to check if a whole Binary XML object has been read.
      this.binaryXmlStructureDecoder.seek(0);
      gotElementEnd = this.binaryXmlStructureDecoder.findElementEnd(data);
      offset = this.binaryXmlStructureDecoder.offset;
    }

    if (gotElementEnd) {
      // Got the remainder of an object.  Report to the caller.
      this.dataParts.push(data.slice(0, offset));
      var element = DataUtils.concatArrays(this.dataParts);
      this.dataParts = [];
      try {
        this.elementListener.onReceivedElement(element);
      } catch (ex) {
          console.log("ElementReader: ignoring exception from onReceivedElement: " + ex);
      }

      // Need to read a new object.
      data = data.slice(offset, data.length);
      this.binaryXmlStructureDecoder = new BinaryXMLStructureDecoder();
      this.tlvStructureDecoder = new TlvStructureDecoder();
      if (data.length == 0)
        // No more data in the packet.
        return;

      // else loop back to decode.
    }
    else {
      // Save for a later call to concatArrays so that we only copy data once.
      this.dataParts.push(data);
      if (LOG > 3) console.log('Incomplete packet received. Length ' + data.length + '. Wait for more input.');
        return;
    }
  }
};

},{"../log.js":53,"./binary-xml-structure-decoder.js":31,"./data-utils.js":33,"./tlv/tlv-structure-decoder.js":42,"./tlv/tlv.js":43}],36:[function(require,module,exports){
/**
 * This file contains utilities to help encode and decode NDN objects.
 * Copyright (C) 2013-2014 Regents of the University of California.
 * author: Meki Cheraoui
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 * A copy of the GNU General Public License is in the file COPYING.
 */

var DataUtils = require('./data-utils.js').DataUtils;
var BinaryXMLEncoder = require('./binary-xml-encoder.js').BinaryXMLEncoder;
var BinaryXMLDecoder = require('./binary-xml-decoder.js').BinaryXMLDecoder;
var Key = require('../key.js').Key;
var KeyLocatorType = require('../key-locator.js').KeyLocatorType;
var Interest = require('../interest.js').Interest;
var Data = require('../data.js').Data;
var FaceInstance = require('../face-instance.js').FaceInstance;
var ForwardingEntry = require('../forwarding-entry.js').ForwardingEntry;
var WireFormat = require('./wire-format.js').WireFormat;
var LOG = require('../log.js').Log.LOG;

/**
 * An EncodingUtils has static methods for encoding data.
 * @constructor
 */
var EncodingUtils = function EncodingUtils()
{
};

exports.EncodingUtils = EncodingUtils;

EncodingUtils.encodeToHexInterest = function(interest, wireFormat)
{
  wireFormat = (wireFormat || WireFormat.getDefaultWireFormat());
  return DataUtils.toHex(interest.wireEncode(wireFormat).buf());
};

EncodingUtils.encodeToHexData = function(data, wireFormat)
{
  wireFormat = (wireFormat || WireFormat.getDefaultWireFormat());
  return DataUtils.toHex(data.wireEncode(wireFormat).buf());
};

/**
 * @deprecated Use EncodingUtils.encodeToHexData(data).
 */
EncodingUtils.encodeToHexContentObject = function(data, wireFormat)
{
  return EncodingUtils.encodeToHexData(data, wireFormat);
}

EncodingUtils.encodeForwardingEntry = function(data)
{
  var enc = new BinaryXMLEncoder();
  data.to_ndnb(enc);
  var bytes = enc.getReducedOstream();

  return bytes;
};

EncodingUtils.decodeHexFaceInstance = function(result)
{
  var numbers = DataUtils.toNumbers(result);
  var decoder = new BinaryXMLDecoder(numbers);

  if (LOG > 3) console.log('DECODING HEX FACE INSTANCE  \n'+numbers);

  var faceInstance = new FaceInstance();
  faceInstance.from_ndnb(decoder);

  return faceInstance;
};

EncodingUtils.decodeHexInterest = function(input, wireFormat)
{
  wireFormat = (wireFormat || WireFormat.getDefaultWireFormat());
  var interest = new Interest();
  interest.wireDecode(DataUtils.toNumbers(input), wireFormat);
  return interest;
};

EncodingUtils.decodeHexData = function(input, wireFormat)
{
  wireFormat = (wireFormat || WireFormat.getDefaultWireFormat());
  var data = new Data();
  data.wireDecode(DataUtils.toNumbers(input), wireFormat);
  return data;
};

/**
 * @deprecated Use EncodingUtils.decodeHexData(input).
 */
EncodingUtils.decodeHexContentObject = function(input, wireFormat)
{
  return EncodingUtils.decodeHexData(input, wireFormat);
}

EncodingUtils.decodeHexForwardingEntry = function(result)
{
  var numbers = DataUtils.toNumbers(result);
  var decoder = new BinaryXMLDecoder(numbers);

  if (LOG > 3) console.log('DECODED HEX FORWARDING ENTRY \n'+numbers);

  var forwardingEntry = new ForwardingEntry();
  forwardingEntry.from_ndnb(decoder);
  return forwardingEntry;
};

/**
 * Decode the Buffer array which holds SubjectPublicKeyInfo and return an RSAKey.
 */
EncodingUtils.decodeSubjectPublicKeyInfo = function(array)
{
  var hex = DataUtils.toHex(array).toLowerCase();
  var a = _x509_getPublicKeyHexArrayFromCertHex(hex, _x509_getSubjectPublicKeyPosFromCertHex(hex, 0));
  var rsaKey = new RSAKey();
  rsaKey.setPublic(a[0], a[1]);
  return rsaKey;
}

/**
 * Return a user friendly HTML string with the contents of data.
 * This also outputs to console.log.
 */
EncodingUtils.dataToHtml = function(/* Data */ data)
{
  var output ="";

  if (data == -1)
    output+= "NO CONTENT FOUND"
  else if (data == -2)
    output+= "CONTENT NAME IS EMPTY"
  else {
    if (data.getName() != null) {
      output+= "NAME: " + data.getName().toUri();

      output+= "<br />";
      output+= "<br />";
    }
    if (!data.getContent().isNull()) {
      output += "CONTENT(ASCII): "+ DataUtils.toString(data.getContent().buf());

      output+= "<br />";
      output+= "<br />";
    }
    if (!data.getContent().isNull()) {
      output += "CONTENT(hex): "+ data.getContent().toHex();

      output+= "<br />";
      output+= "<br />";
    }
    if (data.getSignature() != null && data.getSignature().digestAlgorithm != null) {
      output += "DigestAlgorithm (hex): "+ DataUtils.toHex(data.getSignature().digestAlgorithm);

      output+= "<br />";
      output+= "<br />";
    }
    if (data.getSignature() != null && data.getSignature().witness != null) {
      output += "Witness (hex): "+ DataUtils.toHex(data.getSignature().witness);

      output+= "<br />";
      output+= "<br />";
    }
    if (data.getSignature() != null && data.getSignature().getSignature() != null) {
      output += "Signature(hex): "+ data.getSignature().getSignature().toHex();

      output+= "<br />";
      output+= "<br />";
    }
    if (data.getMetaInfo() != null && data.getMetaInfo().publisher != null && data.getMetaInfo().publisher.publisherPublicKeyDigest != null) {
      output += "Publisher Public Key Digest(hex): "+ DataUtils.toHex(data.getMetaInfo().publisher.publisherPublicKeyDigest);

      output+= "<br />";
      output+= "<br />";
    }
    if (data.getMetaInfo() != null && data.getMetaInfo().timestamp != null) {
      var d = new Date();
      d.setTime(data.getMetaInfo().timestamp.msec);

      var bytes = [217, 185, 12, 225, 217, 185, 12, 225];

      output += "TimeStamp: "+d;
      output+= "<br />";
      output += "TimeStamp(number): "+ data.getMetaInfo().timestamp.msec;

      output+= "<br />";
    }
    if (data.getMetaInfo() != null && data.getMetaInfo().getFinalBlockID().getValue().size() > 0) {
      output += "FinalBlockID: "+ data.getMetaInfo().getFinalBlockID().getValue().toHex();
      output+= "<br />";
    }
    if (data.getMetaInfo() != null && data.getMetaInfo().locator != null && data.getMetaInfo().locator.getType()) {
      output += "keyLocator: ";
      if (data.getMetaInfo().locator.getType() == KeyLocatorType.KEY)
        output += "Key: " + DataUtils.toHex(data.getMetaInfo().locator.publicKey).toLowerCase() + "<br />";
      else if (data.getMetaInfo().locator.getType() == KeyLocatorType.KEY_LOCATOR_DIGEST)
        output += "KeyLocatorDigest: " + DataUtils.toHex(data.getMetaInfo().locator.getKeyData().buf()).toLowerCase() + "<br />";
      else if (data.getMetaInfo().locator.getType() == KeyLocatorType.CERTIFICATE)
        output += "Certificate: " + DataUtils.toHex(data.getMetaInfo().locator.certificate).toLowerCase() + "<br />";
      else if (data.getMetaInfo().locator.getType() == KeyLocatorType.KEYNAME)
        output += "KeyName: " + data.getMetaInfo().locator.keyName.contentName.to_uri() + "<br />";
      else
        output += "[unrecognized ndn_KeyLocatorType " + data.getMetaInfo().locator.getType() + "]<br />";
    }
  }

  return output;
};

/**
 * @deprecated Use return EncodingUtils.dataToHtml(data).
 */
EncodingUtils.contentObjectToHtml = function(data)
{
  return EncodingUtils.dataToHtml(data);
}

//
// Deprecated: For the browser, define these in the global scope.  Applications should access as member of EncodingUtils.
//

var encodeToHexInterest = function(interest) { return EncodingUtils.encodeToHexInterest(interest); }
var encodeToHexContentObject = function(data) { return EncodingUtils.encodeToHexData(data); }
var encodeForwardingEntry = function(data) { return EncodingUtils.encodeForwardingEntry(data); }
var decodeHexFaceInstance = function(input) { return EncodingUtils.decodeHexFaceInstance(input); }
var decodeHexInterest = function(input) { return EncodingUtils.decodeHexInterest(input); }
var decodeHexContentObject = function(input) { return EncodingUtils.decodeHexData(input); }
var decodeHexForwardingEntry = function(input) { return EncodingUtils.decodeHexForwardingEntry(input); }
var decodeSubjectPublicKeyInfo = function(input) { return EncodingUtils.decodeSubjectPublicKeyInfo(input); }
var contentObjectToHtml = function(data) { return EncodingUtils.dataToHtml(data); }

/**
 * @deprecated Use interest.wireEncode().
 */
function encodeToBinaryInterest(interest) { return interest.wireEncode().buf(); }
/**
 * @deprecated Use data.wireEncode().
 */
function encodeToBinaryContentObject(data) { return data.wireEncode().buf(); }

},{"../data.js":28,"../face-instance.js":46,"../forwarding-entry.js":48,"../interest.js":50,"../key-locator.js":51,"../key.js":52,"../log.js":53,"./binary-xml-decoder.js":29,"./binary-xml-encoder.js":30,"./data-utils.js":33,"./wire-format.js":44}],37:[function(require,module,exports){
/**
 * Copyright (C) 2014 Regents of the University of California.
 * @author: Jeff Thompson <jefft0@remap.ucla.edu>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 * A copy of the GNU General Public License is in the file COPYING.
 */

var TlvEncoder = require('./tlv/tlv-encoder.js').TlvEncoder;
var TlvDecoder = require('./tlv/tlv-decoder.js').TlvDecoder;
var Blob = require('../util/blob.js').Blob;

/**
 * ProtobufTlv has static methods to encode and decode an Protobuf Message o
 * bject as NDN-TLV. The Protobuf tag value is used as the TLV type code. A
 * Protobuf message is encoded/decoded as a nested TLV encoding. Protobuf types
 * uint32, uint64 and enum are encoded/decoded as TLV nonNegativeInteger. (It is
 * an error if an enum value is negative.) Protobuf types bytes and string are
 * encoded/decoded as TLV bytes. The Protobuf type bool is encoded/decoded as a
 * TLV boolean (a zero length value for True, omitted for False). Other Protobuf
 * types are an error.
 *
 * Protobuf has no "outer" message type, so you need to put your TLV message
 * inside an outer "typeless" message.
 */
var ProtobufTlv = function ProtobufTlv()
{
};

exports.ProtobufTlv = ProtobufTlv;

// Load ProtoBuf.Reflect.Message.Field dynamically so that protobufjs is optional.
ProtobufTlv._Field = null;
ProtobufTlv.establishField = function()
{
  if (ProtobufTlv._Field === null) {
    try {
      // Using protobuf.min.js in the browser.
      ProtobufTlv._Field = dcodeIO.ProtoBuf.Reflect.Message.Field;
    }
    catch (ex) {
      // Using protobufjs in node or via browserify.
      ProtobufTlv._Field = require("protobufjs/dist/ProtoBuf.js").Reflect.Message.Field;
    }
  }
}

/**
 * Encode the Protobuf message object as NDN-TLV. This calls
 * message.encodeAB() to ensure that all required fields are present and
 * raises an exception if not. (This does not use the result of toArrayBuffer().)
 * @param {ProtoBuf.Builder.Message} message The Protobuf message object.
 * @param {ProtoBuf.Reflect.T} descriptor The reflection descriptor for the
 * message. For example, if the message is of type "MyNamespace.MyMessage" then
 * the descriptor is builder.lookup("MyNamespace.MyMessage").
 * @returns {Blob} The encoded buffer in a Blob object.
 */
ProtobufTlv.encode = function(message, descriptor)
{
  ProtobufTlv.establishField();

  message.encodeAB();
  var encoder = new TlvEncoder();
  ProtobufTlv._encodeMessageValue(message, descriptor, encoder);
  return new Blob(encoder.getOutput(), false);
};

/**
 * Decode the input as NDN-TLV and update the fields of the Protobuf message
 * object.
 * @param {ProtoBuf.Builder.Message} message The Protobuf message object. This
 * does not first clear the object.
 * @param {ProtoBuf.Reflect.T} descriptor The reflection descriptor for the
 * message. For example, if the message is of type "MyNamespace.MyMessage" then
 * the descriptor is builder.lookup("MyNamespace.MyMessage").
 * @param {Blob|Buffer} input The buffer with the bytes to decode.
 */
ProtobufTlv.decode = function(message, descriptor, input)
{
  ProtobufTlv.establishField();

  if (ProtobufTlv._Field === null) {
    if (dcodeIO)
      ProtobufTlv._Field = dcodeIO.ProtoBuf.Reflect.Message.Field;
    else
      ProtobufTlv._Field = require("protobufjs/dist/ProtoBuf.js").Reflect.Message.Field;
  }

  // If input is a blob, get its buf().
  var decodeBuffer = typeof input === 'object' && input instanceof Blob ?
                     input.buf() : input;

  var decoder = new TlvDecoder(decodeBuffer);
  ProtobufTlv._decodeMessageValue
    (message, descriptor, decoder, decodeBuffer.length);
};

ProtobufTlv._encodeMessageValue = function(message, descriptor, encoder)
{
  var fields = descriptor.getChildren(ProtobufTlv._Field);
  // Encode the fields backwards.
  for (var iField = fields.length - 1; iField >= 0; --iField) {
    var field = fields[iField];
    var tlvType = field.id;

    var values;
    if (field.repeated)
      values = message[field.name];
    else {
      if (message[field.name] != null)
        // Make a singleton list.
        values = [message[field.name]];
      else
        continue;
    }

    // Encode the values backwards.
    for (var iValue = values.length - 1; iValue >= 0; --iValue) {
      var value = values[iValue];

      if (field.type.name == "message") {
        var saveLength =  encoder.getLength();

        // Encode backwards.
        ProtobufTlv._encodeMessageValue(value, field.resolvedType, encoder);
        encoder.writeTypeAndLength(tlvType, encoder.getLength() - saveLength);
      }
      else if (field.type.name == "uint32" ||
               field.type.name == "uint64")
        encoder.writeNonNegativeIntegerTlv(tlvType, value);
      else if (field.type.name == "enum") {
        if (value < 0)
          throw new Error("ProtobufTlv::encode: ENUM value may not be negative");
        encoder.writeNonNegativeIntegerTlv(tlvType, value);
      }
      else if (field.type.name == "bytes")
        encoder.writeBlobTlv(tlvType, value.toBinary());
      else if (field.type.name == "string")
        // Use Blob to convert.
        encoder.writeBlobTlv(tlvType, new Blob(value, false).buf());
      else if (field.type.name == "bool") {
        if (value)
          encoder.writeTypeAndLength(tlvType, 0);
      }
      else
        throw new Error("ProtobufTlv::encode: Unknown field type");
    }
  }
};

ProtobufTlv._decodeMessageValue = function(message, descriptor, decoder, endOffset)
{
  var fields = descriptor.getChildren(ProtobufTlv._Field);
  for (var iField = 0; iField < fields.length; ++iField) {
    var field = fields[iField];
    var tlvType = field.id;

    if (!field.required && !decoder.peekType(tlvType, endOffset))
      continue;

    if (field.repeated) {
      while (decoder.peekType(tlvType, endOffset)) {
        if (field.type.name == "message") {
          var innerEndOffset = decoder.readNestedTlvsStart(tlvType);
          var value = new (field.resolvedType.build())();
          message.add(field.name, value);
          ProtobufTlv._decodeMessageValue
            (value, field.resolvedType, decoder, innerEndOffset);
          decoder.finishNestedTlvs(innerEndOffset);
        }
        else
          message.add
            (field.name,
             ProtobufTlv._decodeFieldValue(field, tlvType, decoder, endOffset));
      }
    }
    else {
      if (field.type.name == "message") {
        var innerEndOffset = decoder.readNestedTlvsStart(tlvType);
        var value = new (field.resolvedType.build())();
        message.set(field.name, value);
        ProtobufTlv._decodeMessageValue
          (value, field.resolvedType, decoder, innerEndOffset);
        decoder.finishNestedTlvs(innerEndOffset);
      }
      else
        message.set
          (field.name,
           ProtobufTlv._decodeFieldValue(field, tlvType, decoder, endOffset));
    }
  }
};

/**
 * This is a helper for _decodeMessageValue. Decode a single field and return
 * the value. Assume the field.type.name is not "message".
 */
ProtobufTlv._decodeFieldValue = function(field, tlvType, decoder, endOffset)
{
  if (field.type.name == "uint32" ||
      field.type.name == "uint64" ||
      field.type.name == "enum")
    return decoder.readNonNegativeIntegerTlv(tlvType);
  else if (field.type.name == "bytes")
    return decoder.readBlobTlv(tlvType);
  else if (field.type.name == "string")
    return decoder.readBlobTlv(tlvType).toString();
  else if (field.type.name == "bool")
    return decoder.readBooleanTlv(tlvType, endOffset);
  else
    throw new Error("ProtobufTlv.decode: Unknown field type");
};

},{"../util/blob.js":77,"./tlv/tlv-decoder.js":40,"./tlv/tlv-encoder.js":41,"protobufjs/dist/ProtoBuf.js":85}],38:[function(require,module,exports){
(function (Buffer){
/**
 * Copyright (C) 2013-2014 Regents of the University of California.
 * @author: Jeff Thompson <jefft0@remap.ucla.edu>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 * A copy of the GNU General Public License is in the file COPYING.
 */

var cryptoJS = require('../crypto.js');
var Blob = require('../util/blob.js').Blob;
var Tlv = require('./tlv/tlv.js').Tlv;
var TlvEncoder = require('./tlv/tlv-encoder.js').TlvEncoder;
var TlvDecoder = require('./tlv/tlv-decoder.js').TlvDecoder;
var WireFormat = require('./wire-format.js').WireFormat;
var Exclude = require('../exclude.js').Exclude;
var ContentType = require('../meta-info.js').ContentType;
var KeyLocatorType = require('../key-locator.js').KeyLocatorType;
var Sha256WithRsaSignature = require('../sha256-with-rsa-signature.js').Sha256WithRsaSignature;
var PublisherPublicKeyDigest = require('../publisher-public-key-digest.js').PublisherPublicKeyDigest;
var DecodingException = require('./decoding-exception.js').DecodingException;

/**
 * A Tlv0_1WireFormat implements the WireFormat interface for encoding and
 * decoding with the NDN-TLV wire format, version 0.1a2.
 * @constructor
 */
var Tlv0_1WireFormat = function Tlv0_1WireFormat()
{
  // Inherit from WireFormat.
  WireFormat.call(this);
};

Tlv0_1WireFormat.prototype = new WireFormat();
Tlv0_1WireFormat.prototype.name = "Tlv0_1WireFormat";

exports.Tlv0_1WireFormat = Tlv0_1WireFormat;

// Default object.
Tlv0_1WireFormat.instance = null;

/**
 * Encode the interest using NDN-TLV and return a Buffer.
 * @param {Interest} interest The Interest object to encode.
 * @returns {Blob} A Blob containing the encoding.
 */
Tlv0_1WireFormat.prototype.encodeInterest = function(interest)
{
  var encoder = new TlvEncoder();
  var saveLength = encoder.getLength();

  // Encode backwards.
  encoder.writeOptionalNonNegativeIntegerTlv
    (Tlv.InterestLifetime, interest.getInterestLifetimeMilliseconds());
  encoder.writeOptionalNonNegativeIntegerTlv(Tlv.Scope, interest.getScope());

  // Encode the Nonce as 4 bytes.
  if (interest.getNonce().isNull() || interest.getNonce().size() == 0)
    // This is the most common case. Generate a nonce.
    encoder.writeBlobTlv(Tlv.Nonce, cryptoJS.randomBytes(4));
  else if (interest.getNonce().size() < 4) {
    var nonce = Buffer(4);
    // Copy existing nonce bytes.
    interest.getNonce().buf().copy(nonce);

    // Generate random bytes for remaining bytes in the nonce.
    for (var i = interest.getNonce().size(); i < 4; ++i)
      nonce[i] = cryptoJS.randomBytes(1)[0];

    encoder.writeBlobTlv(Tlv.Nonce, nonce);
  }
  else if (interest.getNonce().size() == 4)
    // Use the nonce as-is.
    encoder.writeBlobTlv(Tlv.Nonce, interest.getNonce().buf());
  else
    // Truncate.
    encoder.writeBlobTlv(Tlv.Nonce, interest.getNonce().buf().slice(0, 4));

  Tlv0_1WireFormat.encodeSelectors(interest, encoder);
  Tlv0_1WireFormat.encodeName(interest.getName(), encoder);

  encoder.writeTypeAndLength(Tlv.Interest, encoder.getLength() - saveLength);

  return new Blob(encoder.getOutput(), false);
};

/**
 * Decode input as an NDN-TLV interest and set the fields of the interest
 * object.
 * @param {Interest} interest The Interest object whose fields are updated.
 * @param {Buffer} input The buffer with the bytes to decode.
 */
Tlv0_1WireFormat.prototype.decodeInterest = function(interest, input)
{
  var decoder = new TlvDecoder(input);

  var endOffset = decoder.readNestedTlvsStart(Tlv.Interest);
  Tlv0_1WireFormat.decodeName(interest.getName(), decoder);
  if (decoder.peekType(Tlv.Selectors, endOffset))
    Tlv0_1WireFormat.decodeSelectors(interest, decoder);
  // Require a Nonce, but don't force it to be 4 bytes.
  var nonce = decoder.readBlobTlv(Tlv.Nonce);
  interest.setScope(decoder.readOptionalNonNegativeIntegerTlv
    (Tlv.Scope, endOffset));
  interest.setInterestLifetimeMilliseconds
    (decoder.readOptionalNonNegativeIntegerTlv(Tlv.InterestLifetime, endOffset));

  // Set the nonce last because setting other interest fields clears it.
  interest.setNonce(nonce);

  decoder.finishNestedTlvs(endOffset);
};

/**
 * Encode data as NDN-TLV and return the encoding and signed offsets.
 * @param {Data} data The Data object to encode.
 * @returns {object} An associative array with fields
 * (encoding, signedPortionBeginOffset, signedPortionEndOffset) where encoding
 * is a Blob containing the encoding, signedPortionBeginOffset is the offset in
 * the encoding of the beginning of the signed portion, and
 * signedPortionEndOffset is the offset in the encoding of the end of the
 * signed portion.
 */
Tlv0_1WireFormat.prototype.encodeData = function(data)
{
  var encoder = new TlvEncoder(1500);
  var saveLength = encoder.getLength();

  // Encode backwards.
  // TODO: The library needs to handle other signature types than
  //   SignatureSha256WithRsa.
  encoder.writeBlobTlv(Tlv.SignatureValue, data.getSignature().getSignature().buf());
  var signedPortionEndOffsetFromBack = encoder.getLength();

  // Use getSignatureOrMetaInfoKeyLocator for the transition of moving
  //   the key locator from the MetaInfo to the Signauture object.
  Tlv0_1WireFormat.encodeSignatureSha256WithRsaValue
    (data.getSignature(), encoder, data.getSignatureOrMetaInfoKeyLocator());
  encoder.writeBlobTlv(Tlv.Content, data.getContent().buf());
  Tlv0_1WireFormat.encodeMetaInfo(data.getMetaInfo(), encoder);
  Tlv0_1WireFormat.encodeName(data.getName(), encoder);
  var signedPortionBeginOffsetFromBack = encoder.getLength();

  encoder.writeTypeAndLength(Tlv.Data, encoder.getLength() - saveLength);
  var signedPortionBeginOffset =
    encoder.getLength() - signedPortionBeginOffsetFromBack;
  var signedPortionEndOffset = encoder.getLength() - signedPortionEndOffsetFromBack;

  return { encoding: new Blob(encoder.getOutput(), false),
           signedPortionBeginOffset: signedPortionBeginOffset,
           signedPortionEndOffset: signedPortionEndOffset };
};

/**
 * Decode input as an NDN-TLV data packet, set the fields in the data object,
 * and return the signed offsets.
 * @param {Data} data The Data object whose fields are updated.
 * @param {Buffer} input The buffer with the bytes to decode.
 * @returns {object} An associative array with fields
 * (signedPortionBeginOffset, signedPortionEndOffset) where
 * signedPortionBeginOffset is the offset in the encoding of the beginning of
 * the signed portion, and signedPortionEndOffset is the offset in the encoding
 * of the end of the signed portion.
 */
Tlv0_1WireFormat.prototype.decodeData = function(data, input)
{
  var decoder = new TlvDecoder(input);

  var endOffset = decoder.readNestedTlvsStart(Tlv.Data);
  var signedPortionBeginOffset = decoder.getOffset();

  Tlv0_1WireFormat.decodeName(data.getName(), decoder);
  Tlv0_1WireFormat.decodeMetaInfo(data.getMetaInfo(), decoder);
  data.setContent(decoder.readBlobTlv(Tlv.Content));
  Tlv0_1WireFormat.decodeSignatureInfo(data, decoder);
  if (data.getSignature() != null &&
      data.getSignature().getKeyLocator() != null &&
      data.getMetaInfo() != null)
    // Copy the key locator pointer to the MetaInfo object for the transition of
    //   moving the key locator from the MetaInfo to the Signature object.
    data.getMetaInfo().locator = data.getSignature().getKeyLocator();

  var signedPortionEndOffset = decoder.getOffset();
  // TODO: The library needs to handle other signature types than
  //   SignatureSha256WithRsa.
  data.getSignature().setSignature(decoder.readBlobTlv(Tlv.SignatureValue));

  decoder.finishNestedTlvs(endOffset);
  return { signedPortionBeginOffset: signedPortionBeginOffset,
           signedPortionEndOffset: signedPortionEndOffset };
};

/**
 * Get a singleton instance of a Tlv1_0a2WireFormat.  To always use the
 * preferred version NDN-TLV, you should use TlvWireFormat.get().
 * @returns {Tlv0_1WireFormat} The singleton instance.
 */
Tlv0_1WireFormat.get = function()
{
  if (Tlv0_1WireFormat.instance === null)
    Tlv0_1WireFormat.instance = new Tlv0_1WireFormat();
  return Tlv0_1WireFormat.instance;
};

Tlv0_1WireFormat.encodeName = function(name, encoder)
{
  var saveLength = encoder.getLength();

  // Encode the components backwards.
  for (var i = name.size() - 1; i >= 0; --i)
    encoder.writeBlobTlv(Tlv.NameComponent, name.get(i).getValue().buf());

  encoder.writeTypeAndLength(Tlv.Name, encoder.getLength() - saveLength);
};

Tlv0_1WireFormat.decodeName = function(name, decoder)
{
  name.clear();

  var endOffset = decoder.readNestedTlvsStart(Tlv.Name);
  while (decoder.getOffset() < endOffset)
      name.append(decoder.readBlobTlv(Tlv.NameComponent));

  decoder.finishNestedTlvs(endOffset);
};

/**
 * Encode the interest selectors.  If no selectors are written, do not output a
 * Selectors TLV.
 */
Tlv0_1WireFormat.encodeSelectors = function(interest, encoder)
{
  var saveLength = encoder.getLength();

  // Encode backwards.
  if (interest.getMustBeFresh())
    encoder.writeTypeAndLength(Tlv.MustBeFresh, 0);
  encoder.writeOptionalNonNegativeIntegerTlv(
    Tlv.ChildSelector, interest.getChildSelector());
  if (interest.getExclude().size() > 0)
    Tlv0_1WireFormat.encodeExclude(interest.getExclude(), encoder);

  if (interest.getKeyLocator().getType() != null)
    Tlv0_1WireFormat.encodeKeyLocator
      (Tlv.PublisherPublicKeyLocator, interest.getKeyLocator(), encoder);
  else {
    // There is no keyLocator. If there is a publisherPublicKeyDigest, then
    //   encode as KEY_LOCATOR_DIGEST. (When we remove the deprecated
    //   publisherPublicKeyDigest, we don't need this.)
    if (null != interest.publisherPublicKeyDigest) {
      var savePublisherPublicKeyDigestLength = encoder.getLength();
      encoder.writeBlobTlv
        (Tlv.KeyLocatorDigest,
         interest.publisherPublicKeyDigest.publisherPublicKeyDigest);
      encoder.writeTypeAndLength
        (Tlv.PublisherPublicKeyLocator,
         encoder.getLength() - savePublisherPublicKeyDigestLength);
    }
  }

  encoder.writeOptionalNonNegativeIntegerTlv(
    Tlv.MaxSuffixComponents, interest.getMaxSuffixComponents());
  encoder.writeOptionalNonNegativeIntegerTlv(
    Tlv.MinSuffixComponents, interest.getMinSuffixComponents());

  // Only output the type and length if values were written.
  if (encoder.getLength() != saveLength)
    encoder.writeTypeAndLength(Tlv.Selectors, encoder.getLength() - saveLength);
};

Tlv0_1WireFormat.decodeSelectors = function(interest, decoder)
{
  var endOffset = decoder.readNestedTlvsStart(Tlv.Selectors);

  interest.setMinSuffixComponents(decoder.readOptionalNonNegativeIntegerTlv
    (Tlv.MinSuffixComponents, endOffset));
  interest.setMaxSuffixComponents(decoder.readOptionalNonNegativeIntegerTlv
    (Tlv.MaxSuffixComponents, endOffset));

  // Initially set publisherPublicKeyDigest to none.
  interest.publisherPublicKeyDigest = null;
  if (decoder.peekType(Tlv.PublisherPublicKeyLocator, endOffset)) {
    Tlv0_1WireFormat.decodeKeyLocator
      (Tlv.PublisherPublicKeyLocator, interest.getKeyLocator(), decoder);
    if (interest.getKeyLocator().getType() == KeyLocatorType.KEY_LOCATOR_DIGEST) {
      // For backwards compatibility, also set the publisherPublicKeyDigest.
      interest.publisherPublicKeyDigest = new PublisherPublicKeyDigest();
      interest.publisherPublicKeyDigest.publisherPublicKeyDigest =
        interest.getKeyLocator().getKeyData().buf();
    }
  }
  else
    interest.getKeyLocator().clear();

  if (decoder.peekType(Tlv.Exclude, endOffset))
    Tlv0_1WireFormat.decodeExclude(interest.getExclude(), decoder);
  else
    interest.getExclude().clear();

  interest.setChildSelector(decoder.readOptionalNonNegativeIntegerTlv
    (Tlv.ChildSelector, endOffset));
  interest.setMustBeFresh(decoder.readBooleanTlv(Tlv.MustBeFresh, endOffset));

  decoder.finishNestedTlvs(endOffset);
};

Tlv0_1WireFormat.encodeExclude = function(exclude, encoder)
{
  var saveLength = encoder.getLength();

  // TODO: Do we want to order the components (except for ANY)?
  // Encode the entries backwards.
  for (var i = exclude.size() - 1; i >= 0; --i) {
    var entry = exclude.get(i);

    if (entry == Exclude.ANY)
      encoder.writeTypeAndLength(Tlv.Any, 0);
    else
      encoder.writeBlobTlv(Tlv.NameComponent, entry.getValue().buf());
  }

  encoder.writeTypeAndLength(Tlv.Exclude, encoder.getLength() - saveLength);
};

Tlv0_1WireFormat.decodeExclude = function(exclude, decoder)
{
  var endOffset = decoder.readNestedTlvsStart(Tlv.Exclude);

  exclude.clear();
  while (true) {
    if (decoder.peekType(Tlv.NameComponent, endOffset))
      exclude.appendComponent(decoder.readBlobTlv(Tlv.NameComponent));
    else if (decoder.readBooleanTlv(Tlv.Any, endOffset))
      exclude.appendAny();
    else
      // Else no more entries.
      break;
  }

  decoder.finishNestedTlvs(endOffset);
};

Tlv0_1WireFormat.encodeKeyLocator = function(type, keyLocator, encoder)
{
  var saveLength = encoder.getLength();

  // Encode backwards.
  if (keyLocator.getType() != null) {
    if (keyLocator.getType() == KeyLocatorType.KEYNAME)
      Tlv0_1WireFormat.encodeName(keyLocator.getKeyName(), encoder);
    else if (keyLocator.getType() == KeyLocatorType.KEY_LOCATOR_DIGEST &&
             keyLocator.getKeyData().size() > 0)
      encoder.writeBlobTlv(Tlv.KeyLocatorDigest, keyLocator.getKeyData().buf());
    else
      throw new Error("Unrecognized KeyLocatorType " + keyLocator.getType());
  }

  encoder.writeTypeAndLength(type, encoder.getLength() - saveLength);
};

Tlv0_1WireFormat.decodeKeyLocator = function
  (expectedType, keyLocator, decoder)
{
  var endOffset = decoder.readNestedTlvsStart(expectedType);

  keyLocator.clear();

  if (decoder.getOffset() == endOffset)
    // The KeyLocator is omitted, so leave the fields as none.
    return;

  if (decoder.peekType(Tlv.Name, endOffset)) {
    // KeyLocator is a Name.
    keyLocator.setType(KeyLocatorType.KEYNAME);
    Tlv0_1WireFormat.decodeName(keyLocator.getKeyName(), decoder);
  }
  else if (decoder.peekType(Tlv.KeyLocatorDigest, endOffset)) {
    // KeyLocator is a KeyLocatorDigest.
    keyLocator.setType(KeyLocatorType.KEY_LOCATOR_DIGEST);
    keyLocator.setKeyData(decoder.readBlobTlv(Tlv.KeyLocatorDigest));
  }
  else
    throw new DecodingException
      ("decodeKeyLocator: Unrecognized key locator type");

  decoder.finishNestedTlvs(endOffset);
};

/**
 * Encode the signature object in TLV, using the given keyLocator instead of the
 * locator in this object.
 * @param {Sha256WithRsaSignature} signature The Sha256WithRsaSignature object to encode.
 * @param {TlvEncoder} encoder The encoder.
 * @param {KeyLocator} keyLocator The key locator to use (from
 * Data.getSignatureOrMetaInfoKeyLocator).
 */
Tlv0_1WireFormat.encodeSignatureSha256WithRsaValue = function
  (signature, encoder, keyLocator)
{
  var saveLength = encoder.getLength();

  // Encode backwards.
  Tlv0_1WireFormat.encodeKeyLocator(Tlv.KeyLocator, keyLocator, encoder);
  encoder.writeNonNegativeIntegerTlv
    (Tlv.SignatureType, Tlv.SignatureType_SignatureSha256WithRsa);

  encoder.writeTypeAndLength(Tlv.SignatureInfo, encoder.getLength() - saveLength);
};

Tlv0_1WireFormat.decodeSignatureInfo = function(data, decoder)
{
  var endOffset = decoder.readNestedTlvsStart(Tlv.SignatureInfo);

  var signatureType = decoder.readNonNegativeIntegerTlv(Tlv.SignatureType);
  // TODO: The library needs to handle other signature types than
  //     SignatureSha256WithRsa.
  if (signatureType == Tlv.SignatureType_SignatureSha256WithRsa) {
      data.setSignature(new Sha256WithRsaSignature());
      // Modify data's signature object because if we create an object
      //   and set it, then data will have to copy all the fields.
      var signatureInfo = data.getSignature();
      Tlv0_1WireFormat.decodeKeyLocator
        (Tlv.KeyLocator, signatureInfo.getKeyLocator(), decoder);
  }
  else
      throw new DecodingException
       ("decodeSignatureInfo: unrecognized SignatureInfo type" + signatureType);

  decoder.finishNestedTlvs(endOffset);
};

Tlv0_1WireFormat.encodeMetaInfo = function(metaInfo, encoder)
{
  var saveLength = encoder.getLength();

  // Encode backwards.
  var finalBlockIdBuf = metaInfo.getFinalBlockID().getValue().buf();
  if (finalBlockIdBuf != null && finalBlockIdBuf.length > 0) {
    // FinalBlockId has an inner NameComponent.
    var finalBlockIdSaveLength = encoder.getLength();
    encoder.writeBlobTlv(Tlv.NameComponent, finalBlockIdBuf);
    encoder.writeTypeAndLength
      (Tlv.FinalBlockId, encoder.getLength() - finalBlockIdSaveLength);
  }

  encoder.writeOptionalNonNegativeIntegerTlv
    (Tlv.FreshnessPeriod, metaInfo.getFreshnessPeriod());
  if (metaInfo.getType() != ContentType.BLOB) {
    // Not the default, so we need to encode the type.
    if (metaInfo.getType() == ContentType.LINK ||
        metaInfo.getType() == ContentType.KEY)
      // The ContentType enum is set up with the correct integer for
      // each NDN-TLV ContentType.
      encoder.writeNonNegativeIntegerTlv(Tlv.ContentType, metaInfo.getType());
    else
      throw new Error("unrecognized TLV ContentType");
  }

  encoder.writeTypeAndLength(Tlv.MetaInfo, encoder.getLength() - saveLength);
};

Tlv0_1WireFormat.decodeMetaInfo = function(metaInfo, decoder)
{
  var endOffset = decoder.readNestedTlvsStart(Tlv.MetaInfo);

  // The ContentType enum is set up with the correct integer for each
  // NDN-TLV ContentType.  If readOptionalNonNegativeIntegerTlv returns
  // None, then setType will convert it to BLOB.
  metaInfo.setType(decoder.readOptionalNonNegativeIntegerTlv
    (Tlv.ContentType, endOffset));
  metaInfo.setFreshnessPeriod
    (decoder.readOptionalNonNegativeIntegerTlv(Tlv.FreshnessPeriod, endOffset));
  if (decoder.peekType(Tlv.FinalBlockId, endOffset)) {
    var finalBlockIdEndOffset = decoder.readNestedTlvsStart(Tlv.FinalBlockId);
    metaInfo.setFinalBlockID(decoder.readBlobTlv(Tlv.NameComponent));
    decoder.finishNestedTlvs(finalBlockIdEndOffset);
  }
  else
    metaInfo.setFinalBlockID(null);

  decoder.finishNestedTlvs(endOffset);
};

}).call(this,require("buffer").Buffer)
},{"../crypto.js":26,"../exclude.js":45,"../key-locator.js":51,"../meta-info.js":54,"../publisher-public-key-digest.js":57,"../sha256-with-rsa-signature.js":73,"../util/blob.js":77,"./decoding-exception.js":34,"./tlv/tlv-decoder.js":40,"./tlv/tlv-encoder.js":41,"./tlv/tlv.js":43,"./wire-format.js":44,"buffer":3}],39:[function(require,module,exports){
/**
 * Copyright (C) 2013-2014 Regents of the University of California.
 * @author: Jeff Thompson <jefft0@remap.ucla.edu>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 * A copy of the GNU General Public License is in the file COPYING.
 */

var WireFormat = require('./wire-format.js').WireFormat;
var Tlv0_1WireFormat = require('./tlv-0_1-wire-format.js').Tlv0_1WireFormat;

/**
 * A TlvWireFormat extends WireFormat to override its methods to
 * implement encoding and decoding using the preferred implementation of NDN-TLV.
 * @constructor
 */
var TlvWireFormat = function TlvWireFormat()
{
  // Inherit from Tlv0_1WireFormat.
  Tlv0_1WireFormat.call(this);
};

TlvWireFormat.prototype = new Tlv0_1WireFormat();
TlvWireFormat.prototype.name = "TlvWireFormat";

exports.TlvWireFormat = TlvWireFormat;

// Default object.
TlvWireFormat.instance = null;

/**
 * Get a singleton instance of a TlvWireFormat.  Assuming that the default
 * wire format was set with WireFormat.setDefaultWireFormat(TlvWireFormat.get()),
 * you can check if this is the default wire encoding with
 * if WireFormat.getDefaultWireFormat() == TlvWireFormat.get().
 * @returns {TlvWireFormat} The singleton instance.
 */
TlvWireFormat.get = function()
{
  if (TlvWireFormat.instance === null)
    TlvWireFormat.instance = new TlvWireFormat();
  return TlvWireFormat.instance;
};

// On loading this module, make this the default wire format.
// This module will be loaded because WireFormat loads it.
WireFormat.setDefaultWireFormat(TlvWireFormat.get());

},{"./tlv-0_1-wire-format.js":38,"./wire-format.js":44}],40:[function(require,module,exports){
/**
 * Copyright (C) 2014 Regents of the University of California.
 * @author: Jeff Thompson <jefft0@remap.ucla.edu>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 * A copy of the GNU General Public License is in the file COPYING.
 */

var DecodingException = require('../decoding-exception.js').DecodingException;

/**
 * Create a new TlvDecoder for decoding the input in the NDN-TLV wire format.
 * @constructor
 * @param {Buffer} input The buffer with the bytes to decode.
 */
var TlvDecoder = function TlvDecoder(input)
{
  this.input = input;
  this.offset = 0;
};

exports.TlvDecoder = TlvDecoder;

/**
 * Decode VAR-NUMBER in NDN-TLV and return it. Update offset.
 * @returns {number} The decoded VAR-NUMBER.
 */
TlvDecoder.prototype.readVarNumber = function()
{
  // Assume array values are in the range 0 to 255.
  var firstOctet = this.input[this.offset];
  this.offset += 1;
  if (firstOctet < 253)
    return firstOctet;
  else
    return this.readExtendedVarNumber(firstOctet);
};

/**
 * A private function to do the work of readVarNumber, given the firstOctet
 * which is >= 253.
 * @param {number} firstOctet The first octet which is >= 253, used to decode
 * the remaining bytes.
 * @returns {number} The decoded VAR-NUMBER.
 */
TlvDecoder.prototype.readExtendedVarNumber = function(firstOctet)
{
  var result;
  // This is a private function so we know firstOctet >= 253.
  if (firstOctet == 253) {
    result = ((this.input[this.offset] << 8) +
           this.input[this.offset + 1]);
    this.offset += 2;
  }
  else if (firstOctet == 254) {
    result = ((this.input[this.offset] << 24) +
          (this.input[this.offset + 1] << 16) +
          (this.input[this.offset + 2] << 8) +
           this.input[this.offset + 3]);
    this.offset += 4;
  }
  else {
    result = ((this.input[this.offset] << 56) +
          (this.input[this.offset + 1] << 48) +
          (this.input[this.offset + 2] << 40) +
          (this.input[this.offset + 3] << 32) +
          (this.input[this.offset + 4] << 24) +
          (this.input[this.offset + 5] << 16) +
          (this.input[this.offset + 6] << 8) +
           this.input[this.offset + 7]);
    this.offset += 8;
  }

  return result;
};

/**
 * Decode the type and length from this's input starting at offset, expecting
 * the type to be expectedType and return the length. Update offset.  Also make
 * sure the decoded length does not exceed the number of bytes remaining in the
 * input.
 * @param {number} expectedType The expected type.
 * @returns {number} The length of the TLV.
 * @throws DecodingException if (did not get the expected TLV type or the TLV length
 * exceeds the buffer length.
 */
TlvDecoder.prototype.readTypeAndLength = function(expectedType)
{
  var type = this.readVarNumber();
  if (type != expectedType)
    throw new DecodingException("Did not get the expected TLV type");

  var length = this.readVarNumber();
  if (this.offset + length > this.input.length)
    throw new DecodingException("TLV length exceeds the buffer length");

  return length;
};

/**
 * Decode the type and length from the input starting at offset, expecting the
 * type to be expectedType.  Update offset.  Also make sure the decoded length
 * does not exceed the number of bytes remaining in the input. Return the offset
 * of the end of this parent TLV, which is used in decoding optional nested
 * TLVs. After reading all nested TLVs, call finishNestedTlvs.
 * @param {number} expectedType The expected type.
 * @returns {number} The offset of the end of the parent TLV.
 * @throws DecodingException if did not get the expected TLV type or the TLV
 * length exceeds the buffer length.
 */
TlvDecoder.prototype.readNestedTlvsStart = function(expectedType)
{
  return this.readTypeAndLength(expectedType) + this.offset;
};

/**
 * Call this after reading all nested TLVs to skip any remaining unrecognized
 * TLVs and to check if the offset after the final nested TLV matches the
 * endOffset returned by readNestedTlvsStart.
 * @param {number} endOffset The offset of the end of the parent TLV, returned
 * by readNestedTlvsStart.
 * @throws DecodingException if the TLV length does not equal the total length
 * of the nested TLVs.
 */
TlvDecoder.prototype.finishNestedTlvs = function(endOffset)
{
  // We expect offset to be endOffset, so check this first.
  if (this.offset == endOffset)
    return;

  // Skip remaining TLVs.
  while (this.offset < endOffset) {
    // Skip the type VAR-NUMBER.
    this.readVarNumber();
    // Read the length and update offset.
    var length = this.readVarNumber();
    this.offset += length;

    if (this.offset > this.input.length)
      throw new DecodingException("TLV length exceeds the buffer length");
  }

  if (this.offset != endOffset)
    throw new DecodingException
      ("TLV length does not equal the total length of the nested TLVs");
};

/**
 * Decode the type from this's input starting at offset, and if it is the
 * expectedType, then return true, else false.  However, if this's offset is
 * greater than or equal to endOffset, then return false and don't try to read
 * the type. Do not update offset.
 * @param {number} expectedType The expected type.
 * @param {number} endOffset The offset of the end of the parent TLV, returned
 * by readNestedTlvsStart.
 * @returns {boolean} true if the type of the next TLV is the expectedType,
 *  otherwise false.
 */
TlvDecoder.prototype.peekType = function(expectedType, endOffset)
{
  if (this.offset >= endOffset)
    // No more sub TLVs to look at.
    return false;
  else {
    var saveOffset = this.offset;
    var type = this.readVarNumber();
    // Restore offset.
    this.offset = saveOffset;

    return type == expectedType;
  }
};

/**
 * Decode a non-negative integer in NDN-TLV and return it. Update offset by
 * length.
 * @param {number} length The number of bytes in the encoded integer.
 * @returns {number} The integer.
 * @throws DecodingException if length is an invalid length for a TLV
 * non-negative integer.
 */
TlvDecoder.prototype.readNonNegativeInteger = function(length)
{
  var result;
  if (length == 1)
    result = this.input[this.offset];
  else if (length == 2)
    result = ((this.input[this.offset] << 8) +
           this.input[this.offset + 1]);
  else if (length == 4)
    result = ((this.input[this.offset] << 24) +
          (this.input[this.offset + 1] << 16) +
          (this.input[this.offset + 2] << 8) +
           this.input[this.offset + 3]);
  else if (length == 8)
    result = ((this.input[this.offset] << 56) +
          (this.input[this.offset + 1] << 48) +
          (this.input[this.offset + 2] << 40) +
          (this.input[this.offset + 3] << 32) +
          (this.input[this.offset + 4] << 24) +
          (this.input[this.offset + 5] << 16) +
          (this.input[this.offset + 6] << 8) +
           this.input[this.offset + 7]);
  else
    throw new DecodingException("Invalid length for a TLV nonNegativeInteger");

  this.offset += length;
  return result;
};

/**
 * Decode the type and length from this's input starting at offset, expecting
 * the type to be expectedType. Then decode a non-negative integer in NDN-TLV
 * and return it.  Update offset.
 * @param {number} expectedType The expected type.
 * @returns {number} The integer.
 * @throws DecodingException if did not get the expected TLV type or can't
 * decode the value.
 */
TlvDecoder.prototype.readNonNegativeIntegerTlv = function(expectedType)
{
  var length = this.readTypeAndLength(expectedType);
  return this.readNonNegativeInteger(length);
};

/**
 * Peek at the next TLV, and if it has the expectedType then call
 * readNonNegativeIntegerTlv and return the integer.  Otherwise, return null.
 * However, if this's offset is greater than or equal to endOffset, then return
 * null and don't try to read the type.
 * @param {number} expectedType The expected type.
 * @param {number} endOffset The offset of the end of the parent TLV, returned
 * by readNestedTlvsStart.
 * @returns {number} The integer or null if the next TLV doesn't have the
 * expected type.
 */
TlvDecoder.prototype.readOptionalNonNegativeIntegerTlv = function
  (expectedType, endOffset)
{
  if (this.peekType(expectedType, endOffset))
    return this.readNonNegativeIntegerTlv(expectedType);
  else
    return null;
};

/**
 * Decode the type and length from this's input starting at offset, expecting
 * the type to be expectedType. Then return an array of the bytes in the value.
 * Update offset.
 * @param {number} expectedType The expected type.
 * @returns {Buffer} The bytes in the value as a slice on the buffer.  This is
 * not a copy of the bytes in the input buffer.  If you need a copy, then you
 * must make a copy of the return value.
 * @throws DecodingException if did not get the expected TLV type.
 */
TlvDecoder.prototype.readBlobTlv = function(expectedType)
{
  var length = this.readTypeAndLength(expectedType);
  var result = this.input.slice(this.offset, this.offset + length);

  // readTypeAndLength already checked if length exceeds the input buffer.
  this.offset += length;
  return result;
};

/**
 * Peek at the next TLV, and if it has the expectedType then call readBlobTlv
 * and return the value.  Otherwise, return null. However, if this's offset is
 * greater than or equal to endOffset, then return null and don't try to read
 * the type.
 * @param {number} expectedType The expected type.
 * @param {number} endOffset The offset of the end of the parent TLV, returned
 * by readNestedTlvsStart.
 * @returns {Buffer} The bytes in the value as a slice on the buffer or null if
 * the next TLV doesn't have the expected type.  This is not a copy of the bytes
 * in the input buffer.  If you need a copy, then you must make a copy of the
 * return value.
 */
TlvDecoder.prototype.readOptionalBlobTlv = function(expectedType, endOffset)
{
  if (this.peekType(expectedType, endOffset))
    return this.readBlobTlv(expectedType);
  else
    return null;
};

/**
 * Peek at the next TLV, and if it has the expectedType then read a type and
 * value, ignoring the value, and return true. Otherwise, return false.
 * However, if this's offset is greater than or equal to endOffset, then return
 * false and don't try to read the type.
 * @param {number} expectedType The expected type.
 * @param {number} endOffset The offset of the end of the parent TLV, returned
 * by readNestedTlvsStart.
 * @returns {boolean} true, or else false if the next TLV doesn't have the
 * expected type.
 */
TlvDecoder.prototype.readBooleanTlv = function(expectedType, endOffset)
{
  if (this.peekType(expectedType, endOffset)) {
    var length = this.readTypeAndLength(expectedType);
    // We expect the length to be 0, but update offset anyway.
    this.offset += length;
    return true;
  }
  else
    return false;
};

/**
 * Get the offset into the input, used for the next read.
 * @returns {number} The offset.
 */
TlvDecoder.prototype.getOffset = function()
{
  return this.offset;
};

/**
 * Set the offset into the input, used for the next read.
 * @param {number} offset The new offset.
 */
TlvDecoder.prototype.seek = function(offset)
{
  this.offset = offset;
};

},{"../decoding-exception.js":34}],41:[function(require,module,exports){
/**
 * Copyright (C) 2014 Regents of the University of California.
 * @author: Jeff Thompson <jefft0@remap.ucla.edu>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 * A copy of the GNU General Public License is in the file COPYING.
 */

var DynamicBuffer = require('../../util/dynamic-buffer.js').DynamicBuffer;

/**
 * Create a new TlvEncoder with an initialCapacity for the encoding buffer.
 * @constructor
 * @param {number} initialCapacity (optional) The initial capacity of the
 * encoding buffer. If omitted, use a default value.
 */
var TlvEncoder = function TlvEncoder(initialCapacity)
{
  initialCapacity = initialCapacity || 16;
  this.output = new DynamicBuffer(initialCapacity);
  // length is the number of bytes that have been written to the back of
  //  this.output.array.
  this.length = 0;
};

exports.TlvEncoder = TlvEncoder;

/**
 * Get the number of bytes that have been written to the output.  You can
 * save this number, write sub TLVs, then subtract the new length from this
 * to get the total length of the sub TLVs.
 * @returns {number} The number of bytes that have been written to the output.
 */
TlvEncoder.prototype.getLength = function()
{
  return this.length;
};

/**
 * Encode varNumber as a VAR-NUMBER in NDN-TLV and write it to this.output just
 * before this.length from the back.  Advance this.length.
 * @param {number} varNumber The non-negative number to encode.
 */
TlvEncoder.prototype.writeVarNumber = function(varNumber)
{
  if (varNumber < 253) {
    this.length += 1;
    this.output.ensureLengthFromBack(this.length);
    this.output.array[this.output.array.length - this.length] = varNumber & 0xff;
  }
  else if (varNumber <= 0xffff) {
    this.length += 3;
    this.output.ensureLengthFromBack(this.length);
    var offset = this.output.array.length - this.length;
    this.output.array[offset] = 253;
    this.output.array[offset + 1] = (varNumber >> 8) & 0xff;
    this.output.array[offset + 2] = varNumber & 0xff;
  }
  else if (varNumber <= 0xffffffff) {
    this.length += 5;
    this.output.ensureLengthFromBack(this.length);
    var offset = this.output.array.length - this.length;
    this.output.array[offset] = 254;
    this.output.array[offset + 1] = (varNumber >> 24) & 0xff;
    this.output.array[offset + 2] = (varNumber >> 16) & 0xff;
    this.output.array[offset + 3] = (varNumber >> 8) & 0xff;
    this.output.array[offset + 4] = varNumber & 0xff;
  }
  else {
    this.length += 9;
    this.output.ensureLengthFromBack(this.length);
    var offset = this.output.array.length - this.length;
    this.output.array[offset] = 255;
    this.output.array[offset + 1] = (varNumber >> 56) & 0xff;
    this.output.array[offset + 2] = (varNumber >> 48) & 0xff;
    this.output.array[offset + 3] = (varNumber >> 40) & 0xff;
    this.output.array[offset + 4] = (varNumber >> 32) & 0xff;
    this.output.array[offset + 5] = (varNumber >> 24) & 0xff;
    this.output.array[offset + 6] = (varNumber >> 16) & 0xff;
    this.output.array[offset + 7] = (varNumber >> 8) & 0xff;
    this.output.array[offset + 8] = varNumber & 0xff;
  }
};

/**
 * Encode the type and length as VAR-NUMBER and write to this.output just before
 * this.length from the back.  Advance this.length.
 * @param {number} type The type of the TLV.
 * @param {number} length The non-negative length of the TLV.
 */
TlvEncoder.prototype.writeTypeAndLength = function(type, length)
{
  // Write backwards.
  this.writeVarNumber(length);
  this.writeVarNumber(type);
};

/**
 * Write the type, then the length of the encoded value then encode value as a
 * non-negative integer and write it to this.output just before this.length from
 * the back. Advance this.length.
 * @param {number} type The type of the TLV.
 * @param {number} value The non-negative integer to encode.
 */
TlvEncoder.prototype.writeNonNegativeIntegerTlv = function(type, value)
{
  if (value < 0)
    throw new Error("TLV integer value may not be negative");

  // JavaScript doesn't distinguish int from float, so round.
  value = Math.round(value)

  // Write backwards.
  var saveNBytes = this.length;
  if (value < 253) {
    this.length += 1;
    this.output.ensureLengthFromBack(this.length);
    this.output.array[this.output.array.length - this.length] = value & 0xff;
  }
  else if (value <= 0xffff) {
    this.length += 2;
    this.output.ensureLengthFromBack(this.length);
    var offset = this.output.array.length - this.length;
    this.output.array[offset]     = (value >> 8) & 0xff;
    this.output.array[offset + 1] = value & 0xff;
  }
  else if (value <= 0xffffffff) {
    this.length += 4;
    this.output.ensureLengthFromBack(this.length);
    var offset = this.output.array.length - this.length;
    this.output.array[offset]     = (value >> 24) & 0xff;
    this.output.array[offset + 1] = (value >> 16) & 0xff;
    this.output.array[offset + 2] = (value >> 8) & 0xff;
    this.output.array[offset + 3] = value & 0xff;
  }
  else {
    this.length += 8;
    this.output.ensureLengthFromBack(this.length);
    var offset = this.output.array.length - this.length;
    this.output.array[offset]     = (value >> 56) & 0xff;
    this.output.array[offset + 1] = (value >> 48) & 0xff;
    this.output.array[offset + 2] = (value >> 40) & 0xff;
    this.output.array[offset + 3] = (value >> 32) & 0xff;
    this.output.array[offset + 4] = (value >> 24) & 0xff;
    this.output.array[offset + 5] = (value >> 16) & 0xff;
    this.output.array[offset + 6] = (value >> 8) & 0xff;
    this.output.array[offset + 7] = value & 0xff;
  }

  this.writeTypeAndLength(type, this.length - saveNBytes);
};

/**
 * If value is negative or null then do nothing, otherwise call
 * writeNonNegativeIntegerTlv.
 * @param {number} type The type of the TLV.
 * @param {number} value If negative or None do nothing, otherwise the integer
 *   to encode.
 */
TlvEncoder.prototype.writeOptionalNonNegativeIntegerTlv = function(type, value)
{
  if (value != null && value >= 0)
    this.writeNonNegativeIntegerTlv(type, value);
};

/**
 * Write the type, then the length of the buffer then the buffer value to
 * this.output just before this.length from the back. Advance this.length.
 * @param {number} type The type of the TLV.
 * @param {Buffer} value The byte array with the bytes of the blob.  If value is
    null, then just write the type and length 0.
 */
TlvEncoder.prototype.writeBlobTlv = function(type, value)
{
  if (value == null) {
    this.writeTypeAndLength(type, 0);
    return;
  }

  // Write backwards, starting with the blob array.
  this.length += value.length;
  this.output.copyFromBack(value, this.length);

  this.writeTypeAndLength(type, value.length);
};

/**
 * If the byte array is null or zero length then do nothing, otherwise call
 * writeBlobTlv.
 * @param {number} type The type of the TLV.
 * @param {Buffer} value If null or zero length do nothing, otherwise the byte
 * array with the bytes of the blob.
 */
TlvEncoder.prototype.writeOptionalBlobTlv = function(type, value)
{
  if (value != null && value.length > 0)
    this.writeBlobTlv(type, value);
};

/**
 * Get a slice of the encoded bytes.
 * @returns {Buffer} A slice backed by the encoding Buffer.
 */
TlvEncoder.prototype.getOutput = function()
{
  return this.output.array.slice(this.output.array.length - this.length);
};

},{"../../util/dynamic-buffer.js":78}],42:[function(require,module,exports){
(function (Buffer){
/**
 * Copyright (C) 2014 Regents of the University of California.
 * @author: Jeff Thompson <jefft0@remap.ucla.edu>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 * A copy of the GNU General Public License is in the file COPYING.
 */

var TlvDecoder = require('./tlv-decoder.js').TlvDecoder;

/**
 * Create and initialize a TlvStructureDecoder.
 */
var TlvStructureDecoder = function TlvStructureDecoder()
{
  this.gotElementEnd = false;
  this.offset = 0;
  this.state = TlvStructureDecoder.READ_TYPE;
  this.headerLength = 0;
  this.useHeaderBuffer = false;
  // 8 bytes is enough to hold the extended bytes in the length encoding
  // where it is an 8-byte number.
  this.headerBuffer = new Buffer(8);
  this.nBytesToRead = 0;
};

exports.TlvStructureDecoder = TlvStructureDecoder;

TlvStructureDecoder.READ_TYPE =         0;
TlvStructureDecoder.READ_TYPE_BYTES =   1;
TlvStructureDecoder.READ_LENGTH =       2;
TlvStructureDecoder.READ_LENGTH_BYTES = 3;
TlvStructureDecoder.READ_VALUE_BYTES =  4;

/**
 * Continue scanning input starting from this.offset to find the element end.
 * If the end of the element which started at offset 0 is found, this returns
 * true and getOffset() is the length of the element.  Otherwise, this returns
 * false which means you should read more into input and call again.
 * @param {Buffer} input The input buffer. You have to pass in input each time
 * because the buffer could be reallocated.
 * @returns {boolean} true if found the element end, false if not.
 */
TlvStructureDecoder.prototype.findElementEnd = function(input)
{
  if (this.gotElementEnd)
    // Someone is calling when we already got the end.
    return true;

  var decoder = new TlvDecoder(input);

  while (true) {
    if (this.offset >= input.length)
      // All the cases assume we have some input. Return and wait for more.
      return false;

    if (this.state == TlvStructureDecoder.READ_TYPE) {
      var firstOctet = input[this.offset];
      this.offset += 1;
      if (firstOctet < 253)
        // The value is simple, so we can skip straight to reading the length.
        this.state = TlvStructureDecoder.READ_LENGTH;
      else {
        // Set up to skip the type bytes.
        if (firstOctet == 253)
          this.nBytesToRead = 2;
        else if (firstOctet == 254)
          this.nBytesToRead = 4;
        else
          // value == 255.
          this.nBytesToRead = 8;

        this.state = TlvStructureDecoder.READ_TYPE_BYTES;
      }
    }
    else if (this.state == TlvStructureDecoder.READ_TYPE_BYTES) {
      var nRemainingBytes = input.length - this.offset;
      if (nRemainingBytes < this.nBytesToRead) {
        // Need more.
        this.offset += nRemainingBytes;
        this.nBytesToRead -= nRemainingBytes;
        return false;
      }

      // Got the type bytes. Move on to read the length.
      this.offset += this.nBytesToRead;
      this.state = TlvStructureDecoder.READ_LENGTH;
    }
    else if (this.state == TlvStructureDecoder.READ_LENGTH) {
      var firstOctet = input[this.offset];
      this.offset += 1;
      if (firstOctet < 253) {
        // The value is simple, so we can skip straight to reading
        //  the value bytes.
        this.nBytesToRead = firstOctet;
        if (this.nBytesToRead == 0) {
          // No value bytes to read. We're finished.
          this.gotElementEnd = true;
          return true;
        }

        this.state = TlvStructureDecoder.READ_VALUE_BYTES;
      }
      else {
        // We need to read the bytes in the extended encoding of
        //  the length.
        if (firstOctet == 253)
          this.nBytesToRead = 2;
        else if (firstOctet == 254)
          this.nBytesToRead = 4;
        else
          // value == 255.
          this.nBytesToRead = 8;

        // We need to use firstOctet in the next state.
        this.firstOctet = firstOctet;
        this.state = TlvStructureDecoder.READ_LENGTH_BYTES;
      }
    }
    else if (this.state == TlvStructureDecoder.READ_LENGTH_BYTES) {
      var nRemainingBytes = input.length - this.offset;
      if (!this.useHeaderBuffer && nRemainingBytes >= this.nBytesToRead) {
        // We don't have to use the headerBuffer. Set nBytesToRead.
        decoder.seek(this.offset);

        this.nBytesToRead = decoder.readExtendedVarNumber(this.firstOctet);
        // Update this.offset to the decoder's offset after reading.
        this.offset = decoder.getOffset();
      }
      else {
        this.useHeaderBuffer = true;

        var nNeededBytes = this.nBytesToRead - this.headerLength;
        if (nNeededBytes > nRemainingBytes) {
          // We can't get all of the header bytes from this input.
          // Save in headerBuffer.
          if (this.headerLength + nRemainingBytes > this.headerBuffer.length)
            // We don't expect this to happen.
            throw new Error
              ("Cannot store more header bytes than the size of headerBuffer");
          input.slice(this.offset, this.offset + nRemainingBytes).copy
            (this.headerBuffer, this.headerLength);
          this.offset += nRemainingBytes;
          this.headerLength += nRemainingBytes;

          return false;
        }

        // Copy the remaining bytes into headerBuffer, read the
        //   length and set nBytesToRead.
        if (this.headerLength + nNeededBytes > this.headerBuffer.length)
          // We don't expect this to happen.
          throw new Error
            ("Cannot store more header bytes than the size of headerBuffer");
        input.slice(this.offset, this.offset + nNeededBytes).copy
          (this.headerBuffer, this.headerLength);
        this.offset += nNeededBytes;

        // Use a local decoder just for the headerBuffer.
        var bufferDecoder = new TlvDecoder(this.headerBuffer);
        // Replace nBytesToRead with the length of the value.
        this.nBytesToRead = bufferDecoder.readExtendedVarNumber(this.firstOctet);
      }

      if (this.nBytesToRead == 0) {
        // No value bytes to read. We're finished.
        this.gotElementEnd = true;
        return true;
      }

      // Get ready to read the value bytes.
      this.state = TlvStructureDecoder.READ_VALUE_BYTES;
    }
    else if (this.state == TlvStructureDecoder.READ_VALUE_BYTES) {
      nRemainingBytes = input.length - this.offset;
      if (nRemainingBytes < this.nBytesToRead) {
        // Need more.
        this.offset += nRemainingBytes;
        this.nBytesToRead -= nRemainingBytes;
        return false;
      }

      // Got the bytes. We're finished.
      this.offset += this.nBytesToRead;
      this.gotElementEnd = true;
      return true;
    }
    else
      // We don't expect this to happen.
      throw new Error("findElementEnd: unrecognized state");
  }
};

/**
 * Get the current offset into the input buffer.
 * @returns {number} The offset.
 */
TlvStructureDecoder.prototype.getOffset = function()
{
  return this.offset;
};

/**
 * Set the offset into the input, used for the next read.
 * @param {number} offset The new offset.
 */
TlvStructureDecoder.prototype.seek = function(offset)
{
  this.offset = offset;
};

}).call(this,require("buffer").Buffer)
},{"./tlv-decoder.js":40,"buffer":3}],43:[function(require,module,exports){
/**
 * Copyright (C) 2014 Regents of the University of California.
 * @author: Jeff Thompson <jefft0@remap.ucla.edu>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 * A copy of the GNU General Public License is in the file COPYING.
 */

/**
 * The Tlv class has static type codes for the NDN-TLV wire format.
 * @constructor
 */
var Tlv = function Tlv()
{
};

exports.Tlv = Tlv;

Tlv.Interest =         5;
Tlv.Data =             6;
Tlv.Name =             7;
Tlv.NameComponent =    8;
Tlv.Selectors =        9;
Tlv.Nonce =            10;
Tlv.Scope =            11;
Tlv.InterestLifetime = 12;
Tlv.MinSuffixComponents = 13;
Tlv.MaxSuffixComponents = 14;
Tlv.PublisherPublicKeyLocator = 15;
Tlv.Exclude =          16;
Tlv.ChildSelector =    17;
Tlv.MustBeFresh =      18;
Tlv.Any =              19;
Tlv.MetaInfo =         20;
Tlv.Content =          21;
Tlv.SignatureInfo =    22;
Tlv.SignatureValue =   23;
Tlv.ContentType =      24;
Tlv.FreshnessPeriod =  25;
Tlv.FinalBlockId =     26;
Tlv.SignatureType =    27;
Tlv.KeyLocator =       28;
Tlv.KeyLocatorDigest = 29;
Tlv.FaceInstance =     128;
Tlv.ForwardingEntry =  129;
Tlv.StatusResponse =   130;
Tlv.Action =           131;
Tlv.FaceID =           132;
Tlv.IPProto =          133;
Tlv.Host =             134;
Tlv.Port =             135;
Tlv.MulticastInterface = 136;
Tlv.MulticastTTL =     137;
Tlv.ForwardingFlags =  138;
Tlv.StatusCode =       139;
Tlv.StatusText =       140;

Tlv.SignatureType_DigestSha256 = 0;
Tlv.SignatureType_SignatureSha256WithRsa = 1;

},{}],44:[function(require,module,exports){
/**
 * This class represents Interest Objects
 * Copyright (C) 2013-2014 Regents of the University of California.
 * @author: Jeff Thompson <jefft0@remap.ucla.edu>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 * A copy of the GNU General Public License is in the file COPYING.
 */

/**
 * Create a WireFormat base class where the encode and decode methods throw an error. You should use a derived class like TlvWireFormat.
 * @constructor
 */
var WireFormat = function WireFormat() {
};

exports.WireFormat = WireFormat;

/**
 * Encode interest and return the encoding.  Your derived class should override.
 * @param {Interest} interest The Interest to encode.
 * @returns {Blob} A Blob containing the encoding.
 * @throws Error This always throws an "unimplemented" error. The derived class should override.
 */
WireFormat.prototype.encodeInterest = function(interest)
{
  throw new Error("encodeInterest is unimplemented in the base WireFormat class.  You should use a derived class.");
};

/**
 * Decode input as an interest and set the fields of the interest object.
 * Your derived class should override.
 * @param {Interest} interest The Interest object whose fields are updated.
 * @param {Buffer} input The buffer with the bytes to decode.
 * @throws Error This always throws an "unimplemented" error. The derived class should override.
 */
WireFormat.prototype.decodeInterest = function(interest, input)
{
  throw new Error("decodeInterest is unimplemented in the base WireFormat class.  You should use a derived class.");
};

/**
 * Encode data and return the encoding and signed offsets. Your derived class
 * should override.
 * @param {Data} data The Data object to encode.
 * @returns {object} An associative array with fields
 * (encoding, signedPortionBeginOffset, signedPortionEndOffset) where encoding
 * is a Blob containing the encoding, signedPortionBeginOffset is the offset in
 * the encoding of the beginning of the signed portion, and
 * signedPortionEndOffset is the offset in the encoding of the end of the
 * signed portion.
 * @throws Error This always throws an "unimplemented" error. The derived class should override.
 */
WireFormat.prototype.encodeData = function(data)
{
  throw new Error("encodeData is unimplemented in the base WireFormat class.  You should use a derived class.");
};

/**
 * Decode input as a data packet, set the fields in the data object, and return
 * the signed offsets.  Your derived class should override.
 * @param {Data} data The Data object whose fields are updated.
 * @param {Buffer} input The buffer with the bytes to decode.
 * @returns {object} An associative array with fields
 * (signedPortionBeginOffset, signedPortionEndOffset) where
 * signedPortionBeginOffset is the offset in the encoding of the beginning of
 * the signed portion, and signedPortionEndOffset is the offset in the encoding
 * of the end of the signed portion.
 * @throws Error This always throws an "unimplemented" error. The derived class should override.
 */
WireFormat.prototype.decodeData = function(data, input)
{
  throw new Error("decodeData is unimplemented in the base WireFormat class.  You should use a derived class.");
};

/**
 * Set the static default WireFormat used by default encoding and decoding
 * methods.
 * @param wireFormat {WireFormat} An object of a subclass of WireFormat.
 */
WireFormat.setDefaultWireFormat = function(wireFormat)
{
  WireFormat.defaultWireFormat = wireFormat;
};

/**
 * Return the default WireFormat used by default encoding and decoding methods
 * which was set with setDefaultWireFormat.
 * @returns {WireFormat} An object of a subclass of WireFormat.
 */
WireFormat.getDefaultWireFormat = function()
{
  return WireFormat.defaultWireFormat;
};

// Invoke TlvWireFormat to set the default format.
// Since tlv-wire-format.js includes this file, put this at the bottom
// to avoid problems with cycles of require.
var TlvWireFormat = require('./tlv-wire-format.js').TlvWireFormat;

},{"./tlv-wire-format.js":39}],45:[function(require,module,exports){
/**
 * This class represents an Interest Exclude.
 * Copyright (C) 2014 Regents of the University of California.
 * @author: Meki Cheraoui
 * @author: Jeff Thompson <jefft0@remap.ucla.edu>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 * A copy of the GNU General Public License is in the file COPYING.
 */

var Name = require('./name.js').Name;
var NDNProtocolDTags = require('./util/ndn-protoco-id-tags.js').NDNProtocolDTags;
var BinaryXMLEncoder = require('./encoding/binary-xml-encoder.js').BinaryXMLEncoder;
var BinaryXMLDecoder = require('./encoding/binary-xml-decoder.js').BinaryXMLDecoder;
var DataUtils = require('./encoding/data-utils.js').DataUtils;
var Blob = require('./util/blob.js').Blob;

/**
 * Create a new Exclude.
 * @constructor
 * @param {Array<Name.Component|Buffer|Exclude.ANY>} values (optional) An array where each element is either a Name.Component, Buffer component or Exclude.ANY.
 */
var Exclude = function Exclude(values)
{
  this.values = [];

  if (typeof values === 'object' && values instanceof Exclude)
    // Copy the exclude.
    this.values = values.values.slice(0);
  else if (values) {
    // Set the changeCount now since append expects it.
    this.changeCount = 0;
    for (var i = 0; i < values.length; ++i) {
      if (values[i] == Exclude.ANY)
        this.appendAny();
      else
        this.appendComponent(values[i]);
    }
  }

  this.changeCount = 0;
};

exports.Exclude = Exclude;

Exclude.ANY = "*";

/**
 * Get the number of entries.
 * @returns {number} The number of entries.
 */
Exclude.prototype.size = function() { return this.values.length; };

/**
 * Get the entry at the given index.
 * @param {number} i The index of the entry, starting from 0.
 * @returns {Exclude.ANY|Name.Component} Exclude.ANY or a Name.Component.
 */
Exclude.prototype.get = function(i) { return this.values[i]; };

/**
 * Append an Exclude.ANY element.
 * @returns This Exclude so that you can chain calls to append.
 */
Exclude.prototype.appendAny = function()
{
  this.values.push(Exclude.ANY);
  ++this.changeCount;
  return this;
};

/**
 * Append a component entry, copying from component.
 * @param {Name.Component|Buffer} component
 * @returns This Exclude so that you can chain calls to append.
 */
Exclude.prototype.appendComponent = function(component)
{
  this.values.push(new Name.Component(component));
  ++this.changeCount;
  return this;
};

/**
 * Clear all the entries.
 */
Exclude.prototype.clear = function()
{
  ++this.changeCount;
  this.values = [];
};

Exclude.prototype.from_ndnb = function(/*XMLDecoder*/ decoder)
{
  decoder.readElementStartDTag(NDNProtocolDTags.Exclude);

  while (true) {
    if (decoder.peekDTag(NDNProtocolDTags.Component))
      this.appendComponent(decoder.readBinaryDTagElement(NDNProtocolDTags.Component));
    else if (decoder.peekDTag(NDNProtocolDTags.Any)) {
      decoder.readElementStartDTag(NDNProtocolDTags.Any);
      decoder.readElementClose();
      this.appendAny();
    }
    else if (decoder.peekDTag(NDNProtocolDTags.Bloom)) {
      // Skip the Bloom and treat it as Any.
      decoder.readBinaryDTagElement(NDNProtocolDTags.Bloom);
      this.appendAny();
    }
    else
      break;
  }

  decoder.readElementClose();
};

Exclude.prototype.to_ndnb = function(/*XMLEncoder*/ encoder)
{
  if (this.values == null || this.values.length == 0)
    return;

  encoder.writeElementStartDTag(NDNProtocolDTags.Exclude);

  // TODO: Do we want to order the components (except for ANY)?
  for (var i = 0; i < this.values.length; ++i) {
    if (this.values[i] == Exclude.ANY) {
      encoder.writeElementStartDTag(NDNProtocolDTags.Any);
      encoder.writeElementClose();
    }
    else
      encoder.writeDTagElement(NDNProtocolDTags.Component, this.values[i].getValue().buf());
  }

  encoder.writeElementClose();
};

/**
 * Return a string with elements separated by "," and Exclude.ANY shown as "*".
 */
Exclude.prototype.toUri = function()
{
  if (this.values == null || this.values.length == 0)
    return "";

  var result = "";
  for (var i = 0; i < this.values.length; ++i) {
    if (i > 0)
      result += ",";

    if (this.values[i] == Exclude.ANY)
      result += "*";
    else
      result += Name.toEscapedString(this.values[i].getValue().buf());
  }
  return result;
};

/**
 * Return true if the component matches any of the exclude criteria.
 */
Exclude.prototype.matches = function(/*Buffer*/ component)
{
  if (typeof component == 'object' && component instanceof Name.Component)
    component = component.getValue().buf();
  else if (typeof component === 'object' && component instanceof Blob)
    component = component.buf();

  for (var i = 0; i < this.values.length; ++i) {
    if (this.values[i] == Exclude.ANY) {
      var lowerBound = null;
      if (i > 0)
        lowerBound = this.values[i - 1];

      // Find the upper bound, possibly skipping over multiple ANY in a row.
      var iUpperBound;
      var upperBound = null;
      for (iUpperBound = i + 1; iUpperBound < this.values.length; ++iUpperBound) {
        if (this.values[iUpperBound] != Exclude.ANY) {
          upperBound = this.values[iUpperBound];
          break;
        }
      }

      // If lowerBound != null, we already checked component equals lowerBound on the last pass.
      // If upperBound != null, we will check component equals upperBound on the next pass.
      if (upperBound != null) {
        if (lowerBound != null) {
          if (Exclude.compareComponents(component, lowerBound) > 0 &&
              Exclude.compareComponents(component, upperBound) < 0)
            return true;
        }
        else {
          if (Exclude.compareComponents(component, upperBound) < 0)
            return true;
        }

        // Make i equal iUpperBound on the next pass.
        i = iUpperBound - 1;
      }
      else {
        if (lowerBound != null) {
            if (Exclude.compareComponents(component, lowerBound) > 0)
              return true;
        }
        else
          // this.values has only ANY.
          return true;
      }
    }
    else {
      if (DataUtils.arraysEqual(component, this.values[i].getValue().buf()))
        return true;
    }
  }

  return false;
};

/**
 * Return -1 if component1 is less than component2, 1 if greater or 0 if equal.
 * A component is less if it is shorter, otherwise if equal length do a byte comparison.
 */
Exclude.compareComponents = function(component1, component2)
{
  if (typeof component1 == 'object' && component1 instanceof Name.Component)
    component1 = component1.getValue().buf();
  if (typeof component2 == 'object' && component2 instanceof Name.Component)
    component2 = component2.getValue().buf();

  return Name.Component.compareBuffers(component1, component2);
};

/**
 * Get the change count, which is incremented each time this object is changed.
 * @returns {number} The change count.
 */
Exclude.prototype.getChangeCount = function()
{
  return this.changeCount;
};

},{"./encoding/binary-xml-decoder.js":29,"./encoding/binary-xml-encoder.js":30,"./encoding/data-utils.js":33,"./name.js":55,"./util/blob.js":77,"./util/ndn-protoco-id-tags.js":81}],46:[function(require,module,exports){
/**
 * This class represents Face Instances
 * Copyright (C) 2013-2014 Regents of the University of California.
 * @author: Meki Cheraoui
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 * A copy of the GNU General Public License is in the file COPYING.
 */

var NDNProtocolDTags = require('./util/ndn-protoco-id-tags.js').NDNProtocolDTags;
var PublisherPublicKeyDigest = require('./publisher-public-key-digest.js').PublisherPublicKeyDigest;

/**
 * @constructor
 */
var FaceInstance  = function FaceInstance(action, publisherPublicKeyDigest, faceID, ipProto, host, port, multicastInterface,
    multicastTTL, freshnessSeconds)
{
  this.action = action;
  this.publisherPublicKeyDigest = publisherPublicKeyDigest;
  this.faceID = faceID;
  this.ipProto = ipProto;
  this.host = host;
  this.Port = port;
  this.multicastInterface =multicastInterface;
  this.multicastTTL =multicastTTL;
  this.freshnessSeconds = freshnessSeconds;
};

exports.FaceInstance = FaceInstance;

FaceInstance.NetworkProtocol = { TCP:6, UDP:17};

/**
 * Used by NetworkObject to decode the object from a network stream.
 */
FaceInstance.prototype.from_ndnb = function(
  //XMLDecoder
  decoder)
{
  decoder.readElementStartDTag(this.getElementLabel());

  if (decoder.peekDTag(NDNProtocolDTags.Action))
    this.action = decoder.readUTF8DTagElement(NDNProtocolDTags.Action);
  if (decoder.peekDTag(NDNProtocolDTags.PublisherPublicKeyDigest)) {
    this.publisherPublicKeyDigest = new PublisherPublicKeyDigest();
    this.publisherPublicKeyDigest.from_ndnb(decoder);
  }
  if (decoder.peekDTag(NDNProtocolDTags.FaceID))
    this.faceID = decoder.readIntegerDTagElement(NDNProtocolDTags.FaceID);
  if (decoder.peekDTag(NDNProtocolDTags.IPProto)) {
    //int
    var pI = decoder.readIntegerDTagElement(NDNProtocolDTags.IPProto);

    this.ipProto = null;

    if (FaceInstance.NetworkProtocol.TCP == pI)
      this.ipProto = FaceInstance.NetworkProtocol.TCP;
    else if (FaceInstance.NetworkProtocol.UDP == pI)
      this.ipProto = FaceInstance.NetworkProtocol.UDP;
    else
      throw new Error("FaceInstance.decoder.  Invalid NDNProtocolDTags.IPProto field: " + pI);
  }

  if (decoder.peekDTag(NDNProtocolDTags.Host))
    this.host = decoder.readUTF8DTagElement(NDNProtocolDTags.Host);
  if (decoder.peekDTag(NDNProtocolDTags.Port))
    this.Port = decoder.readIntegerDTagElement(NDNProtocolDTags.Port);
  if (decoder.peekDTag(NDNProtocolDTags.MulticastInterface))
    this.multicastInterface = decoder.readUTF8DTagElement(NDNProtocolDTags.MulticastInterface);
  if (decoder.peekDTag(NDNProtocolDTags.MulticastTTL))
    this.multicastTTL = decoder.readIntegerDTagElement(NDNProtocolDTags.MulticastTTL);
  if (decoder.peekDTag(NDNProtocolDTags.FreshnessSeconds))
    this.freshnessSeconds = decoder.readIntegerDTagElement(NDNProtocolDTags.FreshnessSeconds);

  decoder.readElementClose();
};

/**
 * Used by NetworkObject to encode the object to a network stream.
 */
FaceInstance.prototype.to_ndnb = function(
  //XMLEncoder
  encoder)
{
  encoder.writeElementStartDTag(this.getElementLabel());

  if (null != this.action && this.action.length != 0)
    encoder.writeDTagElement(NDNProtocolDTags.Action, this.action);
  if (null != this.publisherPublicKeyDigest)
    this.publisherPublicKeyDigest.to_ndnb(encoder);
  if (null != this.faceID)
    encoder.writeDTagElement(NDNProtocolDTags.FaceID, this.faceID);
  if (null != this.ipProto)
    encoder.writeDTagElement(NDNProtocolDTags.IPProto, this.ipProto);
  if (null != this.host && this.host.length != 0)
    encoder.writeDTagElement(NDNProtocolDTags.Host, this.host);
  if (null != this.Port)
    encoder.writeDTagElement(NDNProtocolDTags.Port, this.Port);
  if (null != this.multicastInterface && this.multicastInterface.length != 0)
    encoder.writeDTagElement(NDNProtocolDTags.MulticastInterface, this.multicastInterface);
  if (null !=  this.multicastTTL)
    encoder.writeDTagElement(NDNProtocolDTags.MulticastTTL, this.multicastTTL);
  if (null != this.freshnessSeconds)
    encoder.writeDTagElement(NDNProtocolDTags.FreshnessSeconds, this.freshnessSeconds);

  encoder.writeElementClose();
};

FaceInstance.prototype.getElementLabel = function()
{
  return NDNProtocolDTags.FaceInstance;
};


},{"./publisher-public-key-digest.js":57,"./util/ndn-protoco-id-tags.js":81}],47:[function(require,module,exports){
(function (Buffer){
/**
 * This class represents the top-level object for communicating with an NDN host.
 * Copyright (C) 2013-2014 Regents of the University of California.
 * @author: Meki Cherkaoui, Jeff Thompson <jefft0@remap.ucla.edu>, Wentao Shang
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 * A copy of the GNU General Public License is in the file COPYING.
 */

var crypto = require('crypto');
var DataUtils = require('./encoding/data-utils.js').DataUtils;
var Name = require('./name.js').Name;
var Interest = require('./interest.js').Interest;
var Data = require('./data.js').Data;
var MetaInfo = require('./meta-info.js').MetaInfo;
var ForwardingEntry = require('./forwarding-entry.js').ForwardingEntry;
var TlvWireFormat = require('./encoding/tlv-wire-format.js').TlvWireFormat;
var BinaryXmlWireFormat = require('./encoding/binary-xml-wire-format.js').BinaryXmlWireFormat;
var Tlv = require('./encoding/tlv/tlv.js').Tlv;
var TlvDecoder = require('./encoding/tlv/tlv-decoder.js').TlvDecoder;
var BinaryXMLDecoder = require('./encoding/binary-xml-decoder.js').BinaryXMLDecoder;
var BinaryXMLEncoder = require('./encoding/binary-xml-encoder.js').BinaryXMLEncoder;
var NDNProtocolDTags = require('./util/ndn-protoco-id-tags.js').NDNProtocolDTags;
var Key = require('./key.js').Key;
var KeyLocatorType = require('./key-locator.js').KeyLocatorType;
var globalKeyManager = require('./security/key-manager.js').globalKeyManager;
var ForwardingFlags = require('./forwarding-flags.js').ForwardingFlags;
var Closure = require('./closure.js').Closure;
var UpcallInfo = require('./closure.js').UpcallInfo;
var Transport = require('./transport/transport.js').Transport;
var TcpTransport = require('./transport/tcp-transport.js').TcpTransport;
var UnixTransport = require('./transport/unix-transport.js').UnixTransport;
var fs = require('fs');
var LOG = require('./log.js').Log.LOG;

/**
 * Create a new Face with the given settings.
 * This throws an exception if Face.supported is false.
 * There are two forms of the constructor.  The first form takes the transport and connectionInfo:
 * Face(transport, connectionInfo).  The second form takes an optional settings object:
 * Face([settings]).
 * @constructor
 * @param {Transport} transport An object of a subclass of Transport to use for
 * communication.
 * @param {Transport.ConnectionInfo} connectionInfo This must be a ConnectionInfo
 * from the same subclass of Transport as transport. If omitted and transport is
 * a new UnixTransport() then attempt to create to the Unix socket for the local
 * forwarder.
 * @param {Object} settings (optional) An associative array with the following defaults:
 * {
 *   getTransport: function() { return new WebSocketTransport(); }, // If in the browser.
 *              OR function() { return new TcpTransport(); },       // If in Node.js.
 *              // If getTransport creates a UnixTransport and connectionInfo is null,
 *              // then connect to the local forwarder's Unix socket.
 *   getConnectionInfo: transport.defaultGetConnectionInfo, // a function, on each call it returns a new Transport.ConnectionInfo or null if there are no more hosts.
 *                                                          // If connectionInfo or host is not null, getConnectionInfo is ignored.
 *   connectionInfo: null,
 *   host: null, // If null and connectionInfo is null, use getConnectionInfo when connecting.
 *               // However, if connectionInfo is not null, use it instead.
 *   port: 9696, // If in the browser.
 *      OR 6363, // If in Node.js.
 *               // However, if connectionInfo is not null, use it instead.
 *   onopen: function() { if (LOG > 3) console.log("NDN connection established."); },
 *   onclose: function() { if (LOG > 3) console.log("NDN connection closed."); },
 *   verify: false // If false, don't verify and call upcall with Closure.UPCALL_CONTENT_UNVERIFIED.
 * }
 */
var Face = function Face(transportOrSettings, connectionInfo)
{
  if (!Face.supported)
    throw new Error("The necessary JavaScript support is not available on this platform.");

  var settings;
  if (typeof transportOrSettings == 'object' && transportOrSettings instanceof Transport) {
    this.getConnectionInfo = null;
    this.transport = transportOrSettings;
    this.connectionInfo = (connectionInfo || null);
    // Use defaults for other settings.
    settings = {};

    if (this.connectionInfo == null) {
      if (this.transport && this.transport.__proto__ &&
          this.transport.__proto__.name == "UnixTransport") {
        // Try to create the default connectionInfo for UnixTransport.
        var filePath = Face.getUnixSocketFilePathForLocalhost();
        if (filePath != null)
          this.connectionInfo = new UnixTransport.ConnectionInfo(filePath);
        else
          console.log
            ("Face constructor: Cannot determine the default Unix socket file path for UnixTransport");
        console.log("Using " + this.connectionInfo.toString());
      }
    }
  }
  else {
    settings = (transportOrSettings || {});
    // For the browser, browserify-tcp-transport.js replaces TcpTransport with WebSocketTransport.
    var getTransport = (settings.getTransport || function() { return new TcpTransport(); });
    this.transport = getTransport();
    this.getConnectionInfo = (settings.getConnectionInfo || this.transport.defaultGetConnectionInfo);

    this.connectionInfo = (settings.connectionInfo || null);
    if (this.connectionInfo == null) {
      var host = (settings.host !== undefined ? settings.host : null);

      if (this.transport && this.transport.__proto__ &&
          this.transport.__proto__.name == "UnixTransport") {
        // We are using UnixTransport on Node.js. There is no IP-style host and port.
        if (host != null)
          // Assume the host is the local Unix socket path.
          this.connectionInfo = new UnixTransport.ConnectionInfo(host);
        else {
          // If getConnectionInfo is not null, it will be used instead so no
          // need to set this.connectionInfo.
          if (this.getConnectionInfo == null) {
            var filePath = Face.getUnixSocketFilePathForLocalhost();
            if (filePath != null)
              this.connectionInfo = new UnixTransport.ConnectionInfo(filePath);
            else
              console.log
                ("Face constructor: Cannot determine the default Unix socket file path for UnixTransport");
          }
        }
      }
      else {
        if (host != null) {
          if (typeof WebSocketTransport != 'undefined')
            this.connectionInfo = new WebSocketTransport.ConnectionInfo
              (host, settings.port || 9696);
          else
            this.connectionInfo = new TcpTransport.ConnectionInfo
              (host, settings.port || 6363);
        }
      }
    }
  }

  // Deprecated: Set this.host and this.port for backwards compatibility.
  if (this.connectionInfo == null) {
    this.host = null;
    this.host = null;
  }
  else {
    this.host = this.connectionInfo.host;
    this.host = this.connectionInfo.port;
  }

  this.readyStatus = Face.UNOPEN;
  this.verify = (settings.verify !== undefined ? settings.verify : false);
  // Event handler
  this.onopen = (settings.onopen || function() { if (LOG > 3) console.log("Face connection established."); });
  this.onclose = (settings.onclose || function() { if (LOG > 3) console.log("Face connection closed."); });
  this.ndndid = null;
  // This is used by reconnectAndExpressInterest.
  this.onConnectedCallbacks = [];
};

exports.Face = Face;

Face.UNOPEN = 0;  // the Face is created but not opened yet
Face.OPEN_REQUESTED = 1;  // requested to connect but onopen is not called.
Face.OPENED = 2;  // connection to the forwarder opened
Face.CLOSED = 3;  // connection to the forwarder closed

/**
 * If the forwarder's Unix socket file path exists, then return the file path.
 * Otherwise return an empty string. This uses Node.js blocking file system
 * utilities.
 * @return The Unix socket file path to use, or an empty string.
 */
Face.getUnixSocketFilePathForLocalhost = function()
{
  var filePath = "/var/run/nfd.sock";
  if (fs.existsSync(filePath))
    return filePath;
  else {
    filePath = "/tmp/.ndnd.sock";
    if (fs.existsSync(filePath))
      return filePath;
    else
      return "";
  }
}

/**
 * Return true if necessary JavaScript support is available, else log an error and return false.
 */
Face.getSupported = function()
{
  try {
    var dummy = new Buffer(1).slice(0, 1);
  }
  catch (ex) {
    console.log("NDN not available: Buffer not supported. " + ex);
    return false;
  }

  return true;
};

Face.supported = Face.getSupported();

Face.ndndIdFetcher = new Name('/%C1.M.S.localhost/%C1.M.SRV/ndnd/KEY');

Face.prototype.createRoute = function(hostOrConnectionInfo, port)
{
  if (hostOrConnectionInfo instanceof Transport.ConnectionInfo)
    this.connectionInfo = hostOrConnectionInfo;
  else
    this.connectionInfo = new TcpTransport.ConnectionInfo(hostOrConnectionInfo, port);

  // Deprecated: Set this.host and this.port for backwards compatibility.
  this.host = this.connectionInfo.host;
  this.host = this.connectionInfo.port;
};

Face.KeyStore = new Array();

var KeyStoreEntry = function KeyStoreEntry(name, rsa, time)
{
  this.keyName = name;  // KeyName
  this.rsaKey = rsa;    // RSA key
  this.timeStamp = time;  // Time Stamp
};

Face.addKeyEntry = function(/* KeyStoreEntry */ keyEntry)
{
  var result = Face.getKeyByName(keyEntry.keyName);
  if (result == null)
    Face.KeyStore.push(keyEntry);
  else
    result = keyEntry;
};

Face.getKeyByName = function(/* KeyName */ name)
{
  var result = null;

  for (var i = 0; i < Face.KeyStore.length; i++) {
    if (Face.KeyStore[i].keyName.contentName.match(name.contentName)) {
      if (result == null || Face.KeyStore[i].keyName.contentName.size() > result.keyName.contentName.size())
        result = Face.KeyStore[i];
    }
  }

  return result;
};

Face.prototype.close = function()
{
  if (this.readyStatus != Face.OPENED)
    return;

  this.readyStatus = Face.CLOSED;
  this.transport.close();
};

// For fetching data
Face.PITTable = new Array();
Face.PITTableRemoveRequests = new Array();

/**
 * @constructor
 */
var PITEntry = function PITEntry(pendingInterestId, interest, closure)
{
  this.pendingInterestId = pendingInterestId;
  this.interest = interest;  // Interest
  this.closure = closure;    // Closure
  this.timerID = -1;  // Timer ID
};

PITEntry.lastPendingInterestId = 0;

/**
 * Get the next unique pending interest ID.
 *
 * @returns {number} The next pending interest ID.
 */
PITEntry.getNextPendingInterestId = function()
{
  ++PITEntry.lastPendingInterestId;
  return PITEntry.lastPendingInterestId;
};

/**
 * Return the entry from Face.PITTable where the name conforms to the interest selectors, and
 * the interest name is the longest that matches name.
 */

/**
 * Find all entries from Face.PITTable where the name conforms to the entry's
 * interest selectors, remove the entries from the table, cancel their timeout
 * timers and return them.
 * @param {Name} name The name to find the interest for (from the incoming data
 * packet).
 * @returns {Array<PITEntry>} The matching entries from Face.PITTable, or [] if
 * none are found.
 */
Face.extractEntriesForExpressedInterest = function(name)
{
  var result = [];

  // Go backwards through the list so we can erase entries.
  for (var i = Face.PITTable.length - 1; i >= 0; --i) {
    var entry = Face.PITTable[i];
    if (entry.interest.matchesName(name)) {
      // Cancel the timeout timer.
      clearTimeout(entry.timerID);

      result.push(entry);
      Face.PITTable.splice(i, 1);
    }
  }

  return result;
};

// For publishing data
Face.registeredPrefixTable = new Array();
Face.registeredPrefixRemoveRequests = new Array();

/**
 * @constructor
 */
var RegisteredPrefix = function RegisteredPrefix(registeredPrefixId, prefix, closure)
{
  this.registeredPrefixId = registeredPrefixId;
  this.prefix = prefix;        // String
  this.closure = closure;  // Closure
};

RegisteredPrefix.lastRegisteredPrefixId = 0;

/**
 * Get the next unique registered prefix ID.
 * @returns {number} The next registered prefix ID.
 */
RegisteredPrefix.getNextRegisteredPrefixId = function()
{
  ++RegisteredPrefix.lastRegisteredPrefixId;
  return RegisteredPrefix.lastRegisteredPrefixId;
};

/**
 * Find the first entry from Face.registeredPrefixTable where the entry prefix is the longest that matches name.
 * @param {Name} name The name to find the PrefixEntry for (from the incoming interest packet).
 * @returns {object} The entry from Face.registeredPrefixTable, or 0 if not found.
 */
function getEntryForRegisteredPrefix(name)
{
  var iResult = -1;

  for (var i = 0; i < Face.registeredPrefixTable.length; i++) {
    if (LOG > 3) console.log("Registered prefix " + i + ": checking if " + Face.registeredPrefixTable[i].prefix + " matches " + name);
    if (Face.registeredPrefixTable[i].prefix.match(name)) {
      if (iResult < 0 ||
          Face.registeredPrefixTable[i].prefix.size() > Face.registeredPrefixTable[iResult].prefix.size())
        // Update to the longer match.
        iResult = i;
    }
  }

  if (iResult >= 0)
    return Face.registeredPrefixTable[iResult];
  else
    return null;
}

/**
 * Return a function that selects a host at random from hostList and returns
 * makeConnectionInfo(host, port), and if no more hosts remain, return null.
 * @param {Array<string>} hostList An array of host names.
 * @param {number} port The port for the connection.
 * @param {function} makeConnectionInfo This calls makeConnectionInfo(host, port)
 * to make the Transport.ConnectionInfo. For example:
 * function(host, port) { return new TcpTransport.ConnectionInfo(host, port); }
 * @returns {function} A function which returns a Transport.ConnectionInfo.
 */
Face.makeShuffledHostGetConnectionInfo = function(hostList, port, makeConnectionInfo)
{
  // Make a copy.
  hostList = hostList.slice(0, hostList.length);
  DataUtils.shuffle(hostList);

  return function() {
    if (hostList.length == 0)
      return null;

    return makeConnectionInfo(hostList.splice(0, 1)[0], port);
  };
};

/**
 * Send the interest through the transport, read the entire response and call onData.
 * If the interest times out according to interest lifetime, call onTimeout (if not omitted).
 * There are two forms of expressInterest.  The first form takes the exact interest (including lifetime):
 * expressInterest(interest, onData [, onTimeout]).  The second form creates the interest from
 * a name and optional interest template:
 * expressInterest(name [, template], onData [, onTimeout]).
 * This also supports the deprecated form expressInterest(name, closure [, template]), but you should use the other forms.
 * @param {Interest} interest The Interest to send which includes the interest lifetime for the timeout.
 * @param {function} onData When a matching data packet is received, this calls onData(interest, data) where
 * interest is the interest given to expressInterest and data is the received
 * Data object. NOTE: You must not change the interest object - if you need to
 * change it then make a copy.
 * @param {function} onTimeout (optional) If the interest times out according to the interest lifetime,
 *   this calls onTimeout(interest) where:
 *   interest is the interest given to expressInterest.
 * @param {Name} name The Name for the interest. (only used for the second form of expressInterest).
 * @param {Interest} template (optional) If not omitted, copy the interest selectors from this Interest.
 * If omitted, use a default interest lifetime. (only used for the second form of expressInterest).
 * @returns {number} The pending interest ID which can be used with removePendingInterest.
 */
Face.prototype.expressInterest = function(interestOrName, arg2, arg3, arg4)
{
  // There are several overloaded versions of expressInterest, each shown inline below.

  // expressInterest(Name name, Closure closure);                      // deprecated
  // expressInterest(Name name, Closure closure,   Interest template); // deprecated
  if (arg2 && arg2.upcall && typeof arg2.upcall == 'function') {
    // Assume arg2 is the deprecated use with Closure.
    // The first argument is a name. Make the interest from the name and possible template.
    interest = new Interest(interestOrName);
    if (arg3) {
      var template = arg3;
      interest.setMinSuffixComponents(template.getMinSuffixComponents());
      interest.setMaxSuffixComponents(template.getMaxSuffixComponents());
      interest.publisherPublicKeyDigest = template.publisherPublicKeyDigest;
      interest.setExclude(template.getExclude());
      interest.setChildSelector(template.getChildSelector());
      interest.getAnswerOriginKind(template.getAnswerOriginKind());
      interest.setScope(template.getScope());
      interest.setInterestLifetimeMilliseconds(template.getInterestLifetimeMilliseconds());
    }
    else
      interest.setInterestLifetimeMilliseconds(4000);   // default interest timeout value in milliseconds.

    return this.expressInterestWithClosure(interest, arg2);
  }

  var interest;
  var onData;
  var onTimeout;
  // expressInterest(Interest interest, function onData);
  // expressInterest(Interest interest, function onData, function onTimeout);
  if (typeof interestOrName == 'object' && interestOrName instanceof Interest) {
    // Just use a copy of the interest.
    interest = new Interest(interestOrName);
    onData = arg2;
    onTimeout = (arg3 ? arg3 : function() {});
  }
  else {
    // The first argument is a name. Make the interest from the name and possible template.
    interest = new Interest(interestOrName);
    // expressInterest(Name name, Interest template, function onData);
    // expressInterest(Name name, Interest template, function onData, function onTimeout);
    if (arg2 && typeof arg2 == 'object' && arg2 instanceof Interest) {
      var template = arg2;
      interest.setMinSuffixComponents(template.getMinSuffixComponents());
      interest.setMaxSuffixComponents(template.getMaxSuffixComponents());
      interest.publisherPublicKeyDigest = template.publisherPublicKeyDigest;
      interest.setExclude(template.getExclude());
      interest.setChildSelector(template.getChildSelector());
      interest.getAnswerOriginKind(template.getAnswerOriginKind());
      interest.setScope(template.getScope());
      interest.setInterestLifetimeMilliseconds(template.getInterestLifetimeMilliseconds());

      onData = arg3;
      onTimeout = (arg4 ? arg4 : function() {});
    }
    // expressInterest(Name name, function onData);
    // expressInterest(Name name, function onData,   function onTimeout);
    else {
      interest.setInterestLifetimeMilliseconds(4000);   // default interest timeout
      onData = arg2;
      onTimeout = (arg3 ? arg3 : function() {});
    }
  }

  // Make a Closure from the callbacks so we can use expressInterestWithClosure.
  // TODO: Convert the PIT to use callbacks, not a closure.
  return this.expressInterestWithClosure(interest, new Face.CallbackClosure(onData, onTimeout));
};

Face.CallbackClosure = function FaceCallbackClosure(onData, onTimeout, onInterest, prefix, transport) {
  // Inherit from Closure.
  Closure.call(this);

  this.onData = onData;
  this.onTimeout = onTimeout;
  this.onInterest = onInterest;
  this.prefix = prefix;
  this.transport = transport;
};

Face.CallbackClosure.prototype.upcall = function(kind, upcallInfo) {
  if (kind == Closure.UPCALL_CONTENT || kind == Closure.UPCALL_CONTENT_UNVERIFIED)
    this.onData(upcallInfo.interest, upcallInfo.data);
  else if (kind == Closure.UPCALL_INTEREST_TIMED_OUT)
    this.onTimeout(upcallInfo.interest);
  else if (kind == Closure.UPCALL_INTEREST)
    // Note: We never return INTEREST_CONSUMED because onInterest will send the result to the transport.
    this.onInterest(this.prefix, upcallInfo.interest, this.transport)

  return Closure.RESULT_OK;
};

/**
 * A private method to send the the interest to host:port, read the entire response and call
 * closure.upcall(Closure.UPCALL_CONTENT (or Closure.UPCALL_CONTENT_UNVERIFIED),
 *                 new UpcallInfo(this, interest, 0, data)).
 * @deprecated Use expressInterest with callback functions, not Closure.
 * @param {Interest} the interest, already processed with a template (if supplied).
 * @param {Closure} closure
 * @returns {number} The pending interest ID which can be used with removePendingInterest.
 */
Face.prototype.expressInterestWithClosure = function(interest, closure)
{
  var pendingInterestId = PITEntry.getNextPendingInterestId();

  if (this.connectionInfo == null) {
    if (this.getConnectionInfo == null)
      console.log('ERROR: connectionInfo is NOT SET');
    else {
      var thisFace = this;
      this.connectAndExecute(function() {
        thisFace.reconnectAndExpressInterest(pendingInterestId, interest, closure);
      });
    }
  }
  else
    this.reconnectAndExpressInterest(pendingInterestId, interest, closure);

  return pendingInterestId;
};

/**
 * If the host and port are different than the ones in this.transport, then call
 *   this.transport.connect to change the connection (or connect for the first time).
 * Then call expressInterestHelper.
 */
Face.prototype.reconnectAndExpressInterest = function(pendingInterestId, interest, closure)
{
  var thisFace = this;
  if (!this.connectionInfo.equals(this.transport.connectionInfo) || this.readyStatus === Face.UNOPEN) {
    this.readyStatus = Face.OPEN_REQUESTED;
    this.onConnectedCallbacks.push
      (function() { thisFace.expressInterestHelper(pendingInterestId, interest, closure); });

    this.transport.connect
     (this.connectionInfo, this,
      function() {
        thisFace.readyStatus = Face.OPENED;

        // Execute each action requested while the connection was opening.
        while (thisFace.onConnectedCallbacks.length > 0) {
          try {
            thisFace.onConnectedCallbacks.shift()();
          } catch (ex) {
            console.log("Face.reconnectAndExpressInterest: ignoring exception from onConnectedCallbacks: " + ex);
          }
        }

        if (thisFace.onopen)
          // Call Face.onopen after success
          thisFace.onopen();
      },
      function() { thisFace.closeByTransport(); });
  }
  else {
    if (this.readyStatus === Face.OPEN_REQUESTED)
      // The connection is still opening, so add to the interests to express.
      this.onConnectedCallbacks.push
        (function() { thisFace.expressInterestHelper(pendingInterestId, interest, closure); });
    else if (this.readyStatus === Face.OPENED)
      this.expressInterestHelper(pendingInterestId, interest, closure);
    else
      throw new Error
        ("reconnectAndExpressInterest: unexpected connection is not opened");
  }
};

/**
 * Do the work of reconnectAndExpressInterest once we know we are connected.  Set the PITTable and call
 *   this.transport.send to send the interest.
 */
Face.prototype.expressInterestHelper = function(pendingInterestId, interest, closure)
{
  var binaryInterest = interest.wireEncode();
  var thisFace = this;
  //TODO: check local content store first
  if (closure != null) {
    var removeRequestIndex = -1;
    if (removeRequestIndex != null)
      removeRequestIndex = Face.PITTableRemoveRequests.indexOf(pendingInterestId);
    if (removeRequestIndex >= 0)
      // removePendingInterest was called with the pendingInterestId returned by
      //   expressInterest before we got here, so don't add a PIT entry.
      Face.PITTableRemoveRequests.splice(removeRequestIndex, 1);
    else {
      var pitEntry = new PITEntry(pendingInterestId, interest, closure);
      // TODO: This needs to be a single thread-safe transaction on a global object.
      Face.PITTable.push(pitEntry);
      closure.pitEntry = pitEntry;

      // Set interest timer.
      var timeoutMilliseconds = (interest.getInterestLifetimeMilliseconds() || 4000);
      var timeoutCallback = function() {
        if (LOG > 1) console.log("Interest time out: " + interest.getName().toUri());

        // Remove PIT entry from Face.PITTable, even if we add it again later to re-express
        //   the interest because we don't want to match it in the mean time.
        // TODO: Make this a thread-safe operation on the global PITTable.
        var index = Face.PITTable.indexOf(pitEntry);
        if (index >= 0)
          Face.PITTable.splice(index, 1);

        // Raise closure callback
        if (closure.upcall(Closure.UPCALL_INTEREST_TIMED_OUT, new UpcallInfo(thisFace, interest, 0, null)) == Closure.RESULT_REEXPRESS) {
          if (LOG > 1) console.log("Re-express interest: " + interest.getName().toUri());
          pitEntry.timerID = setTimeout(timeoutCallback, timeoutMilliseconds);
          Face.PITTable.push(pitEntry);
          thisFace.transport.send(binaryInterest.buf());
        }
      };

      pitEntry.timerID = setTimeout(timeoutCallback, timeoutMilliseconds);
    }
  }

  this.transport.send(binaryInterest.buf());
};

/**
 * Remove the pending interest entry with the pendingInterestId from the pending
 * interest table. This does not affect another pending interest with a
 * different pendingInterestId, even if it has the same interest name.
 * If there is no entry with the pendingInterestId, do nothing.
 * @param {number} pendingInterestId The ID returned from expressInterest.
 */
Face.prototype.removePendingInterest = function(pendingInterestId)
{
  if (pendingInterestId == null)
    return;

  // Go backwards through the list so we can erase entries.
  // Remove all entries even though pendingInterestId should be unique.
  var count = 0;
  for (var i = Face.PITTable.length - 1; i >= 0; --i) {
    var entry = Face.PITTable[i];
    if (entry.pendingInterestId == pendingInterestId) {
      // Cancel the timeout timer.
      clearTimeout(entry.timerID);

      Face.PITTable.splice(i, 1);
      ++count;
    }
  }

  if (count == 0) {
    // The pendingInterestId was not found. Perhaps this has been called before
    //   the callback in expressInterest can add to the PIT. Add this
    //   removal request which will be checked before adding to the PIT.
    if (Face.PITTableRemoveRequests.indexOf(pendingInterestId) < 0)
      // Not already requested, so add the request.
      Face.PITTableRemoveRequests.push(pendingInterestId);
  }
};

/**
 * Register prefix with the connected NDN hub and call onInterest when a matching interest is received.
 * This uses the form:
 * registerPrefix(name, onInterest, onRegisterFailed [, flags]).
 * This also supports the deprecated form registerPrefix(name, closure [, intFlags]), but you should use the main form.
 * @param {Name} prefix The Name prefix.
 * @param {function} onInterest When an interest is received which matches the name prefix, this calls
 * onInterest(prefix, interest, transport) where:
 *   prefix is the prefix given to registerPrefix.
 *   interest is the received interest.
 *   transport The Transport with the connection which received the interest. You must encode a signed Data packet and send it using transport.send().
 * NOTE: You must not change the prefix object - if you need to change it then
 * make a copy.
 * @param {function} onRegisterFailed If register prefix fails for any reason,
 * this calls onRegisterFailed(prefix) where:
 *   prefix is the prefix given to registerPrefix.
 * @param {ForwardingFlags} flags (optional) The flags for finer control of which interests are forward to the application.
 * If omitted, use the default flags defined by the default ForwardingFlags constructor.
 * @returns {number} The registered prefix ID which can be used with
 * removeRegisteredPrefix.
 */
Face.prototype.registerPrefix = function(prefix, arg2, arg3, arg4)
{
  // There are several overloaded versions of registerPrefix, each shown inline below.

  // registerPrefix(Name prefix, Closure closure);            // deprecated
  // registerPrefix(Name prefix, Closure closure, int flags); // deprecated
  if (arg2 && arg2.upcall && typeof arg2.upcall == 'function') {
    // Assume arg2 is the deprecated use with Closure.
    if (arg3)
      return this.registerPrefixWithClosure(prefix, arg2, arg3);
    else
      return this.registerPrefixWithClosure(prefix, arg2);
  }

  // registerPrefix(Name prefix, function onInterest, function onRegisterFailed);
  // registerPrefix(Name prefix, function onInterest, function onRegisterFailed, ForwardingFlags flags);
  var onInterest = arg2;
  var onRegisterFailed = (arg3 ? arg3 : function() {});
  var intFlags = (arg4 ? arg4.getForwardingEntryFlags() : new ForwardingFlags().getForwardingEntryFlags());
  return this.registerPrefixWithClosure
    (prefix, new Face.CallbackClosure(null, null, onInterest, prefix, this.transport),
     intFlags, onRegisterFailed);
}

/**
 * A private method to register the prefix with the host, receive the data and call
 * closure.upcall(Closure.UPCALL_INTEREST, new UpcallInfo(this, interest, 0, null)).
 * @deprecated Use registerPrefix with callback functions, not Closure.
 * @param {Name} prefix
 * @param {Closure} closure
 * @param {number} intFlags
 * @param {function} onRegisterFailed (optional) If called from the
 * non-deprecated registerPrefix, call onRegisterFailed(prefix) if registration
 * fails.
 * @returns {number} The registered prefix ID which can be used with
 * removeRegisteredPrefix.
 */
Face.prototype.registerPrefixWithClosure = function
  (prefix, closure, intFlags, onRegisterFailed)
{
  intFlags = intFlags | 3;

  var registeredPrefixId = RegisteredPrefix.getNextRegisteredPrefixId();
  var thisFace = this;
  var onConnected = function() {
    if (thisFace.ndndid == null) {
      // Fetch ndndid first, then register.
      var interest = new Interest(Face.ndndIdFetcher);
      interest.setInterestLifetimeMilliseconds(4000);
      if (LOG > 3) console.log('Expressing interest for ndndid from ndnd.');
      thisFace.reconnectAndExpressInterest
        (null, interest, new Face.FetchNdndidClosure
         (thisFace, registeredPrefixId, prefix, closure, intFlags, onRegisterFailed));
    }
    else
      thisFace.registerPrefixHelper
        (registeredPrefixId, prefix, closure, flags, onRegisterFailed);
  };

  if (this.connectionInfo == null) {
    if (this.getConnectionInfo == null)
      console.log('ERROR: connectionInfo is NOT SET');
    else
      this.connectAndExecute(onConnected);
  }
  else
    onConnected();

  return registeredPrefixId;
};

/**
 * This is a closure to receive the Data for Face.ndndIdFetcher and call
 *   registerPrefixHelper(registeredPrefixId, prefix, callerClosure, flags).
 */
Face.FetchNdndidClosure = function FetchNdndidClosure
  (face, registeredPrefixId, prefix, callerClosure, flags, onRegisterFailed)
{
  // Inherit from Closure.
  Closure.call(this);

  this.face = face;
  this.registeredPrefixId = registeredPrefixId;
  this.prefix = prefix;
  this.callerClosure = callerClosure;
  this.flags = flags;
  this.onRegisterFailed = onRegisterFailed;
};

Face.FetchNdndidClosure.prototype.upcall = function(kind, upcallInfo)
{
  if (kind == Closure.UPCALL_INTEREST_TIMED_OUT) {
    console.log("Timeout while requesting the ndndid.  Cannot registerPrefix for " + this.prefix.toUri() + " .");
    if (this.onRegisterFailed)
      this.onRegisterFailed(this.prefix);
    return Closure.RESULT_OK;
  }
  if (!(kind == Closure.UPCALL_CONTENT ||
        kind == Closure.UPCALL_CONTENT_UNVERIFIED))
    // The upcall is not for us.  Don't expect this to happen.
    return Closure.RESULT_ERR;

  if (LOG > 3) console.log('Got ndndid from ndnd.');
  // Get the digest of the public key in the data packet content.
  var hash = require("crypto").createHash('sha256');
  hash.update(upcallInfo.data.getContent().buf());
  this.face.ndndid = new Buffer(DataUtils.toNumbersIfString(hash.digest()));
  if (LOG > 3) console.log(this.face.ndndid);

  this.face.registerPrefixHelper
    (this.registeredPrefixId, this.prefix, this.callerClosure, this.flags,
     this.onRegisterFailed);

  return Closure.RESULT_OK;
};
/**
 * This is a closure to receive the response Data packet from the register
 * prefix interest sent to the connected NDN hub. If this gets a bad response
 * or a timeout, call onRegisterFailed.
 */
Face.RegisterResponseClosure = function RegisterResponseClosure
  (prefix, onRegisterFailed)
{
  // Inherit from Closure.
  Closure.call(this);

  this.prefix = prefix;
  this.onRegisterFailed = onRegisterFailed;
};

Face.RegisterResponseClosure.prototype.upcall = function(kind, upcallInfo)
{
  if (kind == Closure.UPCALL_INTEREST_TIMED_OUT) {
    if (this.onRegisterFailed)
      this.onRegisterFailed(this.prefix);
    return Closure.RESULT_OK;
  }
  if (!(kind == Closure.UPCALL_CONTENT ||
        kind == Closure.UPCALL_CONTENT_UNVERIFIED))
    // The upcall is not for us.  Don't expect this to happen.
    return Closure.RESULT_ERR;

  var expectedName = new Name("/ndnx/.../selfreg");
  // Got a response. Do a quick check of expected name components.
  if (upcallInfo.data.getName().size() < 4 ||
      !upcallInfo.data.getName().get(0).equals(expectedName.get(0)) ||
      !upcallInfo.data.getName().get(2).equals(expectedName.get(2))) {
    this.onRegisterFailed(this.prefix);
    return;
  }

  // Otherwise, silently succeed.
  return Closure.RESULT_OK;
};

/**
 * Do the work of registerPrefix once we know we are connected with an ndndid.
 */
Face.prototype.registerPrefixHelper = function
  (registeredPrefixId, prefix, closure, flags, onRegisterFailed)
{
  var removeRequestIndex = -1;
  if (removeRequestIndex != null)
    removeRequestIndex = Face.registeredPrefixRemoveRequests.indexOf
      (registeredPrefixId);
  if (removeRequestIndex >= 0) {
    // removeRegisteredPrefix was called with the registeredPrefixId returned by
    //   registerPrefix before we got here, so don't add a registeredPrefixTable
    //   entry.
    Face.registeredPrefixRemoveRequests.splice(removeRequestIndex, 1);
    return;
  }

  var fe = new ForwardingEntry('selfreg', prefix, null, null, flags, null);

  // Always encode as BinaryXml until we support TLV for ForwardingEntry.
  var encoder = new BinaryXMLEncoder();
  fe.to_ndnb(encoder);
  var bytes = encoder.getReducedOstream();

  var metaInfo = new MetaInfo();
  metaInfo.setFields();
  // Since we encode the register prefix message as BinaryXml, use the full
  //   public key in the key locator to make the legacy NDNx happy.
  metaInfo.locator.setType(KeyLocatorType.KEY);
  metaInfo.locator.setKeyData(globalKeyManager.getKey().publicToDER());

  var data = new Data(new Name(), metaInfo, bytes);
  // Always encode as BinaryXml until we support TLV for ForwardingEntry.
  data.sign(BinaryXmlWireFormat.get());
  var coBinary = data.wireEncode(BinaryXmlWireFormat.get());;

  var nodename = this.ndndid;
  var interestName = new Name(['ndnx', nodename, 'selfreg', coBinary]);

  var interest = new Interest(interestName);
  interest.setInterestLifetimeMilliseconds(4000.0);
  interest.setScope(1);
  if (LOG > 3) console.log('Send Interest registration packet.');

  Face.registeredPrefixTable.push
    (new RegisteredPrefix(registeredPrefixId, prefix, closure));

  this.reconnectAndExpressInterest
    (null, interest, new Face.RegisterResponseClosure(prefix, onRegisterFailed));
};

/**
 * Remove the registered prefix entry with the registeredPrefixId from the
 * registered prefix table. This does not affect another registered prefix with
 * a different registeredPrefixId, even if it has the same prefix name. If there
 * is no entry with the registeredPrefixId, do nothing.
 *
 * @param {number} registeredPrefixId The ID returned from registerPrefix.
 */
Face.prototype.removeRegisteredPrefix = function(registeredPrefixId)
{
  // Go backwards through the list so we can erase entries.
  // Remove all entries even though registeredPrefixId should be unique.
  var count = 0;
  for (var i = Face.registeredPrefixTable.length - 1; i >= 0; --i) {
    var entry = Face.registeredPrefixTable[i];
    if (entry.registeredPrefixId == registeredPrefixId) {
      Face.registeredPrefixTable.splice(i, 1);
      ++count;
    }
  }

  if (count == 0) {
    // The registeredPrefixId was not found. Perhaps this has been called before
    //   the callback in registerPrefix can add to the registeredPrefixTable. Add
    //   this removal request which will be checked before adding to the
    //   registeredPrefixTable.
    if (Face.registeredPrefixRemoveRequests.indexOf(registeredPrefixId) < 0)
      // Not already requested, so add the request.
      Face.registeredPrefixRemoveRequests.push(registeredPrefixId);
  }
};

/**
 * This is called when an entire binary XML element is received, such as a Data or Interest.
 * Look up in the PITTable and call the closure callback.
 */
Face.prototype.onReceivedElement = function(element)
{
  if (LOG > 3) console.log('Complete element received. Length ' + element.length + '. Start decoding.');
  // First, decode as Interest or Data.
  var interest = null;
  var data = null;
  // The type codes for TLV Interest and Data packets are chosen to not
  //   conflict with the first byte of a binary XML packet, so we can
  //   just look at the first byte.
  if (element[0] == Tlv.Interest || element[0] == Tlv.Data) {
    var decoder = new TlvDecoder (element);
    if (decoder.peekType(Tlv.Interest, element.length)) {
      interest = new Interest();
      interest.wireDecode(element, TlvWireFormat.get());
    }
    else if (decoder.peekType(Tlv.Data, element.length)) {
      data = new Data();
      data.wireDecode(element, TlvWireFormat.get());
    }
  }
  else {
    // Binary XML.
    var decoder = new BinaryXMLDecoder(element);
    if (decoder.peekDTag(NDNProtocolDTags.Interest)) {
      interest = new Interest();
      interest.wireDecode(element, BinaryXmlWireFormat.get());
    }
    else if (decoder.peekDTag(NDNProtocolDTags.Data)) {
      data = new Data();
      data.wireDecode(element, BinaryXmlWireFormat.get());
    }
  }

  // Now process as Interest or Data.
  if (interest !== null) {
    if (LOG > 3) console.log('Interest packet received.');

    var entry = getEntryForRegisteredPrefix(interest.getName());
    if (entry != null) {
      if (LOG > 3) console.log("Found registered prefix for " + interest.getName().toUri());
      var info = new UpcallInfo(this, interest, 0, null);
      var ret = entry.closure.upcall(Closure.UPCALL_INTEREST, info);
      if (ret == Closure.RESULT_INTEREST_CONSUMED && info.data != null)
        this.transport.send(info.data.wireEncode().buf());
    }
  }
  else if (data !== null) {
    if (LOG > 3) console.log('Data packet received.');

    var pendingInterests = Face.extractEntriesForExpressedInterest(data.getName());
    // Process each matching PIT entry (if any).
    for (var i = 0; i < pendingInterests.length; ++i) {
      var pitEntry = pendingInterests[i];
      var currentClosure = pitEntry.closure;

      if (this.verify == false) {
        // Pass content up without verifying the signature
        currentClosure.upcall(Closure.UPCALL_CONTENT_UNVERIFIED, new UpcallInfo(this, pitEntry.interest, 0, data));
        continue;
      }

      // Key verification

      // Recursive key fetching & verification closure
      var KeyFetchClosure = function KeyFetchClosure(content, closure, key, sig, wit) {
        this.data = content;  // unverified data packet object
        this.closure = closure;  // closure corresponding to the data
        this.keyName = key;  // name of current key to be fetched

        Closure.call(this);
      };

      var thisFace = this;
      KeyFetchClosure.prototype.upcall = function(kind, upcallInfo) {
        if (kind == Closure.UPCALL_INTEREST_TIMED_OUT) {
          console.log("In KeyFetchClosure.upcall: interest time out.");
          console.log(this.keyName.contentName.toUri());
        }
        else if (kind == Closure.UPCALL_CONTENT) {
          var rsakey = new Key();
          rsakey.readDerPublicKey(upcallInfo.data.getContent().buf());
          var verified = data.verify(rsakey);

          var flag = (verified == true) ? Closure.UPCALL_CONTENT : Closure.UPCALL_CONTENT_BAD;
          this.closure.upcall(flag, new UpcallInfo(thisFace, null, 0, this.data));

          // Store key in cache
          var keyEntry = new KeyStoreEntry(keylocator.keyName, rsakey, new Date().getTime());
          Face.addKeyEntry(keyEntry);
        }
        else if (kind == Closure.UPCALL_CONTENT_BAD)
          console.log("In KeyFetchClosure.upcall: signature verification failed");
      };

      if (data.getMetaInfo() && data.getMetaInfo().locator && data.getSignature()) {
        if (LOG > 3) console.log("Key verification...");
        var sigHex = data.getSignature().getSignature().toHex();

        var wit = null;
        if (data.getSignature().witness != null)
            //SWT: deprecate support for Witness decoding and Merkle hash tree verification
            currentClosure.upcall(Closure.UPCALL_CONTENT_BAD, new UpcallInfo(this, pitEntry.interest, 0, data));

        var keylocator = data.getMetaInfo().locator;
        if (keylocator.getType() == KeyLocatorType.KEYNAME) {
          if (LOG > 3) console.log("KeyLocator contains KEYNAME");

          if (keylocator.keyName.contentName.match(data.getName())) {
            if (LOG > 3) console.log("Content is key itself");

            var rsakey = new Key();
            rsakey.readDerPublicKey(data.getContent().buf());
            var verified = data.verify(rsakey);
            var flag = (verified == true) ? Closure.UPCALL_CONTENT : Closure.UPCALL_CONTENT_BAD;

            currentClosure.upcall(flag, new UpcallInfo(this, pitEntry.interest, 0, data));

            // SWT: We don't need to store key here since the same key will be stored again in the closure.
          }
          else {
            // Check local key store
            var keyEntry = Face.getKeyByName(keylocator.keyName);
            if (keyEntry) {
              // Key found, verify now
              if (LOG > 3) console.log("Local key cache hit");
              var rsakey = keyEntry.rsaKey;
              var verified = data.verify(rsakey);
              var flag = (verified == true) ? Closure.UPCALL_CONTENT : Closure.UPCALL_CONTENT_BAD;

              // Raise callback
              currentClosure.upcall(flag, new UpcallInfo(this, pitEntry.interest, 0, data));
            }
            else {
              // Not found, fetch now
              if (LOG > 3) console.log("Fetch key according to keylocator");
              var nextClosure = new KeyFetchClosure(data, currentClosure, keylocator.keyName, sigHex, wit);
              // TODO: Use expressInterest with callbacks, not Closure.
              this.expressInterest(keylocator.keyName.contentName.getPrefix(4), nextClosure);
            }
          }
        }
        else if (keylocator.getType() == KeyLocatorType.KEY) {
          if (LOG > 3) console.log("Keylocator contains KEY");

          var rsakey = new Key();
          rsakey.readDerPublicKey(keylocator.publicKey);
          var verified = data.verify(rsakey);

          var flag = (verified == true) ? Closure.UPCALL_CONTENT : Closure.UPCALL_CONTENT_BAD;
          // Raise callback
          currentClosure.upcall(Closure.UPCALL_CONTENT, new UpcallInfo(this, pitEntry.interest, 0, data));

          // Since KeyLocator does not contain key name for this key,
          // we have no way to store it as a key entry in KeyStore.
        }
        else {
          var cert = keylocator.certificate;
          console.log("KeyLocator contains CERT");
          console.log(cert);
          // TODO: verify certificate
        }
      }
    }
  }
};

/**
 * Assume this.getConnectionInfo is not null.  This is called when
 * this.connectionInfo is null or its host is not alive.
 * Get a connectionInfo, connect, then execute onConnected().
 */
Face.prototype.connectAndExecute = function(onConnected)
{
  var connectionInfo = this.getConnectionInfo();
  if (connectionInfo == null) {
    console.log('ERROR: No more connectionInfo from getConnectionInfo');
    this.connectionInfo = null;
    // Deprecated: Set this.host and this.port for backwards compatibility.
    this.host = null;
    this.host = null;

    return;
  }

  if (connectionInfo.equals(this.connectionInfo)) {
    console.log
      ('ERROR: The host returned by getConnectionInfo is not alive: ' +
       this.connectionInfo.toString());
    return;
  }

  this.connectionInfo = connectionInfo;
  if (LOG>0) console.log("connectAndExecute: trying host from getConnectionInfo: " +
                         this.connectionInfo.toString());
  // Deprecated: Set this.host and this.port for backwards compatibility.
  this.host = this.connectionInfo.host;
  this.host = this.connectionInfo.port;

  // Fetch any content.
  var interest = new Interest(new Name("/"));
  interest.setInterestLifetimeMilliseconds(4000);

  var thisFace = this;
  var timerID = setTimeout(function() {
    if (LOG>0) console.log("connectAndExecute: timeout waiting for host " + thisFace.host);
      // Try again.
      thisFace.connectAndExecute(onConnected);
  }, 3000);

  this.reconnectAndExpressInterest(null, interest, new Face.ConnectClosure(this, onConnected, timerID));
};

/**
 * This is called by the Transport when the connection is closed by the remote host.
 */
Face.prototype.closeByTransport = function()
{
  this.readyStatus = Face.CLOSED;
  this.onclose();
};

Face.ConnectClosure = function ConnectClosure(face, onConnected, timerID)
{
  // Inherit from Closure.
  Closure.call(this);

  this.face = face;
  this.onConnected = onConnected;
  this.timerID = timerID;
};

Face.ConnectClosure.prototype.upcall = function(kind, upcallInfo)
{
  if (!(kind == Closure.UPCALL_CONTENT ||
        kind == Closure.UPCALL_CONTENT_UNVERIFIED))
    // The upcall is not for us.
    return Closure.RESULT_ERR;

  // The host is alive, so cancel the timeout and continue with onConnected().
  clearTimeout(this.timerID);

  if (LOG>0) console.log("connectAndExecute: connected to host " + this.face.host);
  this.onConnected();

  return Closure.RESULT_OK;
};

/**
 * @deprecated Use new Face.
 */
var NDN = function NDN(settings)
{
  // Call the base constructor.
  Face.call(this, settings);
}

// Use dummy functions so that the Face constructor will not try to set its own defaults.
NDN.prototype = new Face({ getTransport: function(){}, getConnectionInfo: function(){} });

exports.NDN = NDN;

NDN.supported = Face.supported;
NDN.UNOPEN = Face.UNOPEN;
NDN.OPEN_REQUESTED = Face.OPEN_REQUESTED;
NDN.OPENED = Face.OPENED;
NDN.CLOSED = Face.CLOSED;

}).call(this,require("buffer").Buffer)
},{"./closure.js":27,"./data.js":28,"./encoding/binary-xml-decoder.js":29,"./encoding/binary-xml-encoder.js":30,"./encoding/binary-xml-wire-format.js":32,"./encoding/data-utils.js":33,"./encoding/tlv-wire-format.js":39,"./encoding/tlv/tlv-decoder.js":40,"./encoding/tlv/tlv.js":43,"./forwarding-entry.js":48,"./forwarding-flags.js":49,"./interest.js":50,"./key-locator.js":51,"./key.js":52,"./log.js":53,"./meta-info.js":54,"./name.js":55,"./security/key-manager.js":66,"./transport/tcp-transport.js":25,"./transport/transport.js":74,"./transport/unix-transport.js":75,"./util/ndn-protoco-id-tags.js":81,"buffer":3,"crypto":7,"fs":2}],48:[function(require,module,exports){
/**
 * This class represents Forwarding Entries
 * Copyright (C) 2013-2014 Regents of the University of California.
 * @author: Meki Cheraoui
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 * A copy of the GNU General Public License is in the file COPYING.
 */

var NDNProtocolDTags = require('./util/ndn-protoco-id-tags.js').NDNProtocolDTags;
var PublisherPublicKeyDigest = require('./publisher-public-key-digest.js').PublisherPublicKeyDigest;
var Name = require('./name.js').Name;

/**
 * Create a new ForwardingEntry with the optional arguments.
 * @constructor
 * @param {String} action
 * @param {Name} prefixName
 * @param {PublisherPublicKeyDigest} ndndId
 * @param {number} faceID
 * @param {number} flags
 * @param {number} lifetime in seconds
 */
var ForwardingEntry = function ForwardingEntry(action, prefixName, ndndId, faceID, flags, lifetime)
{
  this.action = action;
  this.prefixName = prefixName;
  this.ndndID = ndndId;
  this.faceID = faceID;
  this.flags = flags;
  this.lifetime = lifetime;
};

exports.ForwardingEntry = ForwardingEntry;

ForwardingEntry.ACTIVE         = 1;
ForwardingEntry.CHILD_INHERIT  = 2;
ForwardingEntry.ADVERTISE      = 4;
ForwardingEntry.LAST           = 8;
ForwardingEntry.CAPTURE       = 16;
ForwardingEntry.LOCAL         = 32;
ForwardingEntry.TAP           = 64;
ForwardingEntry.CAPTURE_OK   = 128;

ForwardingEntry.prototype.from_ndnb = function(
  //XMLDecoder
  decoder)
  //throws DecodingException
{
  decoder.readElementStartDTag(this.getElementLabel());
  if (decoder.peekDTag(NDNProtocolDTags.Action))
    this.action = decoder.readUTF8DTagElement(NDNProtocolDTags.Action);
  if (decoder.peekDTag(NDNProtocolDTags.Name)) {
    this.prefixName = new Name();
    this.prefixName.from_ndnb(decoder) ;
  }
  if (decoder.peekDTag(NDNProtocolDTags.PublisherPublicKeyDigest)) {
    this.NdndId = new PublisherPublicKeyDigest();
    this.NdndId.from_ndnb(decoder);
  }
  if (decoder.peekDTag(NDNProtocolDTags.FaceID))
    this.faceID = decoder.readIntegerDTagElement(NDNProtocolDTags.FaceID);
  if (decoder.peekDTag(NDNProtocolDTags.ForwardingFlags))
    this.flags = decoder.readIntegerDTagElement(NDNProtocolDTags.ForwardingFlags);
  if (decoder.peekDTag(NDNProtocolDTags.FreshnessSeconds))
    this.lifetime = decoder.readIntegerDTagElement(NDNProtocolDTags.FreshnessSeconds);

  decoder.readElementClose();
};

ForwardingEntry.prototype.to_ndnb = function(
  //XMLEncoder
  encoder)
{
  encoder.writeElementStartDTag(this.getElementLabel());
  if (null != this.action && this.action.length != 0)
    encoder.writeDTagElement(NDNProtocolDTags.Action, this.action);
  if (null != this.prefixName)
    this.prefixName.to_ndnb(encoder);
  if (null != this.NdndId)
    this.NdndId.to_ndnb(encoder);
  if (null != this.faceID)
    encoder.writeDTagElement(NDNProtocolDTags.FaceID, this.faceID);
  if (null != this.flags)
    encoder.writeDTagElement(NDNProtocolDTags.ForwardingFlags, this.flags);
  if (null != this.lifetime)
    encoder.writeDTagElement(NDNProtocolDTags.FreshnessSeconds, this.lifetime);

  encoder.writeElementClose();
};

ForwardingEntry.prototype.getElementLabel = function() { return NDNProtocolDTags.ForwardingEntry; }

},{"./name.js":55,"./publisher-public-key-digest.js":57,"./util/ndn-protoco-id-tags.js":81}],49:[function(require,module,exports){
/**
 * Copyright (C) 2013-2014 Regents of the University of California.
 * @author: Jeff Thompson <jefft0@remap.ucla.edu>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 * A copy of the GNU General Public License is in the file COPYING.
 */

var ForwardingEntry = require('./forwarding-entry.js').ForwardingEntry;

/**
 * A ForwardingFlags object holds the flags which specify how the forwarding daemon should forward an interest for
 * a registered prefix.  We use a separate ForwardingFlags object to retain future compatibility if the daemon forwarding
 * bits are changed, amended or deprecated.
 * Create a new ForwardingFlags with "active" and "childInherit" set and all other flags cleared.
 */
var ForwardingFlags = function ForwardingFlags()
{
  this.active = true;
  this.childInherit = true;
  this.advertise = false;
  this.last = false;
  this.capture = false;
  this.local = false;
  this.tap = false;
  this.captureOk = false;
}

exports.ForwardingFlags = ForwardingFlags;

/**
 * Get an integer with the bits set according to the flags as used by the ForwardingEntry message.
 * @returns {number} An integer with the bits set.
 */
ForwardingFlags.prototype.getForwardingEntryFlags = function()
{
  var result = 0;

  if (this.active)
    result |= ForwardingEntry.ACTIVE;
  if (this.childInherit)
    result |= ForwardingEntry.CHILD_INHERIT;
  if (this.advertise)
    result |= ForwardingEntry.ADVERTISE;
  if (this.last)
    result |= ForwardingEntry.LAST;
  if (this.capture)
    result |= ForwardingEntry.CAPTURE;
  if (this.local)
    result |= ForwardingEntry.LOCAL;
  if (this.tap)
    result |= ForwardingEntry.TAP;
  if (this.captureOk)
    result |= ForwardingEntry.CAPTURE_OK;

  return result;
};

/**
 * Set the flags according to the bits in forwardingEntryFlags as used by the ForwardingEntry message.
 * @param {number} forwardingEntryFlags An integer with the bits set.
 */
ForwardingFlags.prototype.setForwardingEntryFlags = function(forwardingEntryFlags)
{
  this.active = ((forwardingEntryFlags & ForwardingEntry.ACTIVE) != 0);
  this.childInherit = ((forwardingEntryFlags & ForwardingEntry.CHILD_INHERIT) != 0);
  this.advertise = ((forwardingEntryFlags & ForwardingEntry.ADVERTISE) != 0);
  this.last = ((forwardingEntryFlags & ForwardingEntry.LAST) != 0);
  this.capture = ((forwardingEntryFlags & ForwardingEntry.CAPTURE) != 0);
  this.local = ((forwardingEntryFlags & ForwardingEntry.LOCAL) != 0);
  this.tap = ((forwardingEntryFlags & ForwardingEntry.TAP) != 0);
  this.captureOk = ((forwardingEntryFlags & ForwardingEntry.CAPTURE_OK) != 0);
};

/**
 * Get the value of the "active" flag.
 * @returns {Boolean} true if the flag is set, false if it is cleared.
 */
ForwardingFlags.prototype.getActive = function() { return this.active; };

/**
 * Get the value of the "childInherit" flag.
 * @returns {Boolean} true if the flag is set, false if it is cleared.
 */
ForwardingFlags.prototype.getChildInherit = function() { return this.childInherit; };

/**
 * Get the value of the "advertise" flag.
 * @returns {Boolean} true if the flag is set, false if it is cleared.
 */
ForwardingFlags.prototype.getAdvertise = function() { return this.advertise; };

/**
 * Get the value of the "last" flag.
 * @returns {Boolean} true if the flag is set, false if it is cleared.
 */
ForwardingFlags.prototype.getLast = function() { return this.last; };

/**
 * Get the value of the "capture" flag.
 * @returns {Boolean} true if the flag is set, false if it is cleared.
 */
ForwardingFlags.prototype.getCapture = function() { return this.capture; };

/**
 * Get the value of the "local" flag.
 * @returns {Boolean} true if the flag is set, false if it is cleared.
 */
ForwardingFlags.prototype.getLocal = function() { return this.local; };

/**
 * Get the value of the "tap" flag.
 * @returns {Boolean} true if the flag is set, false if it is cleared.
 */
ForwardingFlags.prototype.getTap = function() { return this.tap; };

/**
 * Get the value of the "captureOk" flag.
 * @returns {Boolean} true if the flag is set, false if it is cleared.
 */
ForwardingFlags.prototype.getCaptureOk = function() { return this.captureOk; };

/**
 * Set the value of the "active" flag
 * @param {number} value true to set the flag, false to clear it.
 */
ForwardingFlags.prototype.setActive = function(value) { this.active = value; };

/**
 * Set the value of the "childInherit" flag
 * @param {number} value true to set the flag, false to clear it.
 */
ForwardingFlags.prototype.setChildInherit = function(value) { this.childInherit = value; };

/**
 * Set the value of the "advertise" flag
 * @param {number} value true to set the flag, false to clear it.
 */
ForwardingFlags.prototype.setAdvertise = function(value) { this.advertise = value; };

/**
 * Set the value of the "last" flag
 * @param {number} value true to set the flag, false to clear it.
 */
ForwardingFlags.prototype.setLast = function(value) { this.last = value; };

/**
 * Set the value of the "capture" flag
 * @param {number} value true to set the flag, false to clear it.
 */
ForwardingFlags.prototype.setCapture = function(value) { this.capture = value; };

/**
 * Set the value of the "local" flag
 * @param {number} value true to set the flag, false to clear it.
 */
ForwardingFlags.prototype.setLocal = function(value) { this.local = value; };

/**
 * Set the value of the "tap" flag
 * @param {number} value true to set the flag, false to clear it.
 */
ForwardingFlags.prototype.setTap = function(value) { this.tap = value; };

/**
 * Set the value of the "captureOk" flag
 * @param {number} value true to set the flag, false to clear it.
 */
ForwardingFlags.prototype.setCaptureOk = function(value) { this.captureOk = value; };

},{"./forwarding-entry.js":48}],50:[function(require,module,exports){
(function (Buffer){
/**
 * This class represents Interest Objects
 * Copyright (C) 2013-2014 Regents of the University of California.
 * @author: Meki Cheraoui
 * @author: Jeff Thompson <jefft0@remap.ucla.edu>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 * A copy of the GNU General Public License is in the file COPYING.
 */

var Blob = require('./util/blob.js').Blob;
var Name = require('./name.js').Name;
var Exclude = require('./exclude.js').Exclude;
var PublisherPublicKeyDigest = require('./publisher-public-key-digest.js').PublisherPublicKeyDigest;
var KeyLocator = require('./key-locator.js').KeyLocator;
var WireFormat = require('./encoding/wire-format.js').WireFormat;

/**
 * Create a new Interest with the optional values.
 *
 * @constructor
 * @param {Name|Interest} nameOrInterest If this is an Interest, copy values from the interest and ignore the
 * other arguments.  Otherwise this is the optional name for the new Interest.
 * @param {number} minSuffixComponents
 * @param {number} maxSuffixComponents
 * @param {Buffer} publisherPublicKeyDigest
 * @param {Exclude} exclude
 * @param {number} childSelector
 * @param {number} answerOriginKind
 * @param {number} scope
 * @param {number} interestLifetimeMilliseconds in milliseconds
 * @param {Buffer} nonce
 */
var Interest = function Interest
   (nameOrInterest, minSuffixComponents, maxSuffixComponents, publisherPublicKeyDigest, exclude,
    childSelector, answerOriginKind, scope, interestLifetimeMilliseconds, nonce)
{
  if (typeof nameOrInterest === 'object' && nameOrInterest instanceof Interest) {
    // Special case: this is a copy constructor.  Ignore all but the first argument.
    var interest = nameOrInterest;
    if (interest.name)
      // Copy the name.
      this.name = new Name(interest.name);
    this.maxSuffixComponents = interest.maxSuffixComponents;
    this.minSuffixComponents = interest.minSuffixComponents;

    this.publisherPublicKeyDigest = interest.publisherPublicKeyDigest;
    this.keyLocator = new KeyLocator(interest.keyLocator);
    this.exclude = new Exclude(interest.exclude);
    this.childSelector = interest.childSelector;
    this.answerOriginKind = interest.answerOriginKind;
    this.scope = interest.scope;
    this.interestLifetime = interest.interestLifetime;
    if (interest.nonce)
      // Copy.
      this.nonce = new Buffer(interest.nonce);
  }
  else {
    this.name = typeof nameOrInterest === 'object' && nameOrInterest instanceof Name ?
                new Name(nameOrInterest) : new Name();
    this.maxSuffixComponents = maxSuffixComponents;
    this.minSuffixComponents = minSuffixComponents;

    this.publisherPublicKeyDigest = publisherPublicKeyDigest;
    this.keyLocator = new KeyLocator();
    this.exclude = typeof exclude === 'object' && exclude instanceof Exclude ?
                   new Exclude(exclude) : new Exclude();
    this.childSelector = childSelector;
    this.answerOriginKind = answerOriginKind;
    this.scope = scope;
    this.interestLifetime = interestLifetimeMilliseconds;
    if (nonce)
      // Copy and make sure it is a Buffer.
      this.nonce = new Buffer(nonce);
  }
};

exports.Interest = Interest;

Interest.RECURSIVE_POSTFIX = "*";

Interest.CHILD_SELECTOR_LEFT = 0;
Interest.CHILD_SELECTOR_RIGHT = 1;

Interest.ANSWER_NO_CONTENT_STORE = 0;
Interest.ANSWER_CONTENT_STORE = 1;
Interest.ANSWER_GENERATED = 2;
Interest.ANSWER_STALE = 4;    // Stale answer OK
Interest.MARK_STALE = 16;    // Must have scope 0.  Michael calls this a "hack"

Interest.DEFAULT_ANSWER_ORIGIN_KIND = Interest.ANSWER_CONTENT_STORE | Interest.ANSWER_GENERATED;

/**
 * Return true if this.name.match(name) and the name conforms to the interest selectors.
 * @param {Name} name
 * @returns {boolean}
 */
Interest.prototype.matchesName = function(/*Name*/ name)
{
  if (!this.name.match(name))
    return false;

  if (this.minSuffixComponents != null &&
      // Add 1 for the implicit digest.
      !(name.size() + 1 - this.name.size() >= this.minSuffixComponents))
    return false;
  if (this.maxSuffixComponents != null &&
      // Add 1 for the implicit digest.
      !(name.size() + 1 - this.name.size() <= this.maxSuffixComponents))
    return false;
  if (this.exclude != null && name.size() > this.name.size() &&
      this.exclude.matches(name.get(this.name.size())))
    return false;

  return true;
};

/**
 * @deprecated Use matchesName.
 */
Interest.prototype.matches_name = function(/*Name*/ name)
{
  return this.matchesName(name);
};

/**
 * Return a new Interest with the same fields as this Interest.
 */
Interest.prototype.clone = function()
{
  return new Interest
     (this.name, this.minSuffixComponents, this.maxSuffixComponents,
      this.publisherPublicKeyDigest, this.exclude, this.childSelector, this.answerOriginKind,
      this.scope, this.interestLifetime, this.nonce);
};

/**
 * Get the interest Name.
 * @returns {Name} The name.  The name size() may be 0 if not specified.
 */
Interest.prototype.getName = function() { return this.name; };

/**
 * Get the min suffix components.
 * @returns number} The min suffix components, or null if not specified.
 */
Interest.prototype.getMinSuffixComponents = function()
{
  return this.minSuffixComponents;
};

/**
 * Get the max suffix components.
 * @returns {number} The max suffix components, or null if not specified.
 */
Interest.prototype.getMaxSuffixComponents = function()
{
  return this.maxSuffixComponents;
};

/**
 * Get the interest key locator.
 * @returns {KeyLocator} The key locator. If its getType() is null,
 * then the key locator is not specified.
 */
Interest.prototype.getKeyLocator = function()
{
  return this.keyLocator;
};

/**
 * Get the exclude object.
 * @returns {Exclude} The exclude object. If the exclude size() is zero, then
 * the exclude is not specified.
 */
Interest.prototype.getExclude = function() { return this.exclude; };

/**
 * Get the child selector.
 * @returns {number} The child selector, or null if not specified.
 */
Interest.prototype.getChildSelector = function()
{
  return this.childSelector;
};

/**
 * @deprecated Use getMustBeFresh.
 */
Interest.prototype.getAnswerOriginKind = function()
{
  return this.answerOriginKind;
};

  /**
   * Return true if the content must be fresh.
   * @return true if must be fresh, otherwise false.
   */

/**
 * Get the must be fresh flag. If not specified, the default is true.
 * @returns {boolean} The must be fresh flag.
 */
Interest.prototype.getMustBeFresh = function()
{
  if (this.answerOriginKind == null || this.answerOriginKind < 0)
    return true;
  else
    return (this.answerOriginKind & Interest.ANSWER_STALE) == 0;
};

/**
 * Return the nonce value from the incoming interest.  If you change any of the
 * fields in this Interest object, then the nonce value is cleared.
 * @returns {Blob} The nonce. If not specified, the value isNull().
 */
Interest.prototype.getNonce = function()
{
  // For backwards-compatibility, leave this.nonce as a Buffer but return a Blob.
  return  new Blob(this.nonce, false);
};

/**
 * @deprecated Use getNonce. This method returns a Buffer which is the former
 * behavior of getNonce, and should only be used while updating your code.
 */
Interest.prototype.getNonceAsBuffer = function()
{
  return this.nonce;
};

/**
 * Get the interest scope.
 * @returns {number} The scope, or null if not specified.
 */
Interest.prototype.getScope = function() { return this.scope; };

/**
 * Get the interest lifetime.
 * @returns {number} The interest lifetime in milliseconds, or null if not
 * specified.
 */
Interest.prototype.getInterestLifetimeMilliseconds = function()
{
  return this.interestLifetime;
};

Interest.prototype.setName = function(name)
{
  // The object has changed, so the nonce is invalid.
  this.nonce = null;

  this.name = typeof name === 'object' && name instanceof Interest ?
              new Name(name) : new Name();
};

Interest.prototype.setMinSuffixComponents = function(minSuffixComponents)
{
  // The object has changed, so the nonce is invalid.
  this.nonce = null;

  this.minSuffixComponents = minSuffixComponents;
};

Interest.prototype.setMaxSuffixComponents = function(maxSuffixComponents)
{
  // The object has changed, so the nonce is invalid.
  this.nonce = null;

  this.maxSuffixComponents = maxSuffixComponents;
};

/**
 * Set this interest to use a copy of the given exclude object. Note: You can
 * also change this interest's exclude object modifying the object from
 * getExclude().
 * @param {Exclude} exclude The exlcude object that is copied.
 */
Interest.prototype.setExclude = function(exclude)
{
  // The object has changed, so the nonce is invalid.
  this.nonce = null;

  this.exclude = typeof exclude === 'object' && exclude instanceof Exclude ?
                 new Exclude(exclude) : new Exclude();
};

Interest.prototype.setChildSelector = function(childSelector)
{
  // The object has changed, so the nonce is invalid.
  this.nonce = null;

  this.childSelector = childSelector;
};

/**
 * @deprecated Use setMustBeFresh.
 */
Interest.prototype.setAnswerOriginKind = function(answerOriginKind)
{
  // The object has changed, so the nonce is invalid.
  this.nonce = null;

  this.answerOriginKind = answerOriginKind;
};

/**
 * Set the MustBeFresh flag.
 * @param {boolean} mustBeFresh True if the content must be fresh, otherwise false.
 */
Interest.prototype.setMustBeFresh = function(mustBeFresh)
{
  // The object has changed, so the nonce is invalid.
  this.nonce = null;

  if (this.answerOriginKind == null || this.answerOriginKind < 0) {
    // It is is already the default where MustBeFresh is true.
    if (!mustBeFresh)
      // Set answerOriginKind_ so that getMustBeFresh returns false.
      this.answerOriginKind = Interest.ANSWER_STALE;
  }
  else {
    if (mustBeFresh)
      // Clear the stale bit.
      this.answerOriginKind &= ~Interest.ANSWER_STALE;
    else
      // Set the stale bit.
      this.answerOriginKind |= Interest.ANSWER_STALE;
  }
};

Interest.prototype.setScope = function(scope)
{
  // The object has changed, so the nonce is invalid.
  this.nonce = null;

  this.scope = scope;
};

Interest.prototype.setInterestLifetimeMilliseconds = function(interestLifetimeMilliseconds)
{
  // The object has changed, so the nonce is invalid.
  this.nonce = null;

  this.interestLifetime = interestLifetimeMilliseconds;
};

/**
 * @deprecated You should let the wire encoder generate a random nonce
 * internally before sending the interest.
 */
Interest.prototype.setNonce = function(nonce)
{
  if (nonce) {
    if (typeof nonce === 'object' && nonce instanceof Blob)
      this.nonce = nonce.buf();
    else
      // Copy and make sure it is a Buffer.
      this.nonce = new Buffer(nonce);
  }
  else
    this.nonce = null;
};

/**
 * Encode the name according to the "NDN URI Scheme".  If there are interest selectors, append "?" and
 * added the selectors as a query string.  For example "/test/name?ndn.ChildSelector=1".
 * @returns {string} The URI string.
 * @note This is an experimental feature.  See the API docs for more detail at
 * http://named-data.net/doc/ndn-ccl-api/interest.html#interest-touri-method .
 */
Interest.prototype.toUri = function()
{
  var selectors = "";

  if (this.minSuffixComponents != null)
    selectors += "&ndn.MinSuffixComponents=" + this.minSuffixComponents;
  if (this.maxSuffixComponents != null)
    selectors += "&ndn.MaxSuffixComponents=" + this.maxSuffixComponents;
  if (this.childSelector != null)
    selectors += "&ndn.ChildSelector=" + this.childSelector;
  if (this.answerOriginKind != null)
    selectors += "&ndn.AnswerOriginKind=" + this.answerOriginKind;
  if (this.scope != null)
    selectors += "&ndn.Scope=" + this.scope;
  if (this.interestLifetime != null)
    selectors += "&ndn.InterestLifetime=" + this.interestLifetime;
  if (this.publisherPublicKeyDigest != null)
    selectors += "&ndn.PublisherPublicKeyDigest=" + Name.toEscapedString(this.publisherPublicKeyDigest.publisherPublicKeyDigest);
  if (this.nonce != null)
    selectors += "&ndn.Nonce=" + Name.toEscapedString(this.nonce);
  if (this.exclude != null && this.exclude.size() > 0)
    selectors += "&ndn.Exclude=" + this.exclude.toUri();

  var result = this.name.toUri();
  if (selectors != "")
    // Replace the first & with ?.
    result += "?" + selectors.substr(1);

  return result;
};

/**
 * Encode this Interest for a particular wire format.
 * @param {WireFormat} wireFormat (optional) A WireFormat object  used to encode
 * this object. If omitted, use WireFormat.getDefaultWireFormat().
 * @returns {Blob} The encoded buffer in a Blob object.
 */
Interest.prototype.wireEncode = function(wireFormat)
{
  wireFormat = (wireFormat || WireFormat.getDefaultWireFormat());
  return wireFormat.encodeInterest(this);
};

/**
 * Decode the input using a particular wire format and update this Interest.
 * @param {Blob|Buffer} input The buffer with the bytes to decode.
 * @param {WireFormat} wireFormat (optional) A WireFormat object used to decode
 * this object. If omitted, use WireFormat.getDefaultWireFormat().
 */
Interest.prototype.wireDecode = function(input, wireFormat)
{
  wireFormat = (wireFormat || WireFormat.getDefaultWireFormat());
  // If input is a blob, get its buf().
  var decodeBuffer = typeof input === 'object' && input instanceof Blob ?
                     input.buf() : input;
  wireFormat.decodeInterest(this, decodeBuffer);
};

// Since binary-xml-wire-format.js includes this file, put these at the bottom
// to avoid problems with cycles of require.
var BinaryXmlWireFormat = require('./encoding/binary-xml-wire-format.js').BinaryXmlWireFormat;

/**
 * @deprecated Use wireDecode(input, BinaryXmlWireFormat.get()).
 */
Interest.prototype.from_ndnb = function(/*XMLDecoder*/ decoder)
{
  BinaryXmlWireFormat.decodeInterest(this, decoder);
};

/**
 * @deprecated Use wireEncode(BinaryXmlWireFormat.get()).
 */
Interest.prototype.to_ndnb = function(/*XMLEncoder*/ encoder)
{
  BinaryXmlWireFormat.encodeInterest(this, encoder);
};

/**
 * @deprecated Use wireEncode.  If you need binary XML, use
 * wireEncode(BinaryXmlWireFormat.get()).
 */
Interest.prototype.encode = function(wireFormat)
{
  return this.wireEncode(BinaryXmlWireFormat.get()).buf();
};

/**
 * @deprecated Use wireDecode.  If you need binary XML, use
 * wireDecode(input, BinaryXmlWireFormat.get()).
 */
Interest.prototype.decode = function(input, wireFormat)
{
  this.wireDecode(input, BinaryXmlWireFormat.get())
};

}).call(this,require("buffer").Buffer)
},{"./encoding/binary-xml-wire-format.js":32,"./encoding/wire-format.js":44,"./exclude.js":45,"./key-locator.js":51,"./name.js":55,"./publisher-public-key-digest.js":57,"./util/blob.js":77,"buffer":3}],51:[function(require,module,exports){
(function (Buffer){
/**
 * This class represents an NDN KeyLocator object.
 * Copyright (C) 2014 Regents of the University of California.
 * @author: Meki Cheraoui
 * @author: Jeff Thompson <jefft0@remap.ucla.edu>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 * A copy of the GNU General Public License is in the file COPYING.
 */

var Blob = require('./util/blob.js').Blob;
var Name = require('./name.js').Name;
var NDNProtocolDTags = require('./util/ndn-protoco-id-tags.js').NDNProtocolDTags;
var PublisherID = require('./publisher-id.js').PublisherID;
var LOG = require('./log.js').Log.LOG;

/**
 * KeyLocator
 */
var KeyLocatorType = {
  KEYNAME: 1,
  KEY_LOCATOR_DIGEST: 2,
  KEY: 3,
  CERTIFICATE: 4
};

exports.KeyLocatorType = KeyLocatorType;

/**
 * @constructor
 */
var KeyLocator = function KeyLocator(input,type)
{
  if (typeof input === 'object' && input instanceof KeyLocator) {
    // Copy from the input KeyLocator.
    this.type = input.type;
    this.keyName = new KeyName();
    if (input.keyName != null) {
      this.keyName.contentName = input.keyName.contentName == null ?
        null : new Name(input.keyName.contentName);
      this.keyName.publisherID = input.keyName.publisherID;
    }
    this.keyData = input.keyData == null ? null : new Buffer(input.keyData);
    this.publicKey = input.publicKey == null ? null : new Buffer(input.publicKey);
    this.certificate = input.certificate == null ? null : new Buffer(input.certificate);
  }
  else {
    this.type = type;
    this.keyName = new KeyName();

    if (type == KeyLocatorType.KEYNAME)
      this.keyName = input;
    else if (type == KeyLocatorType.KEY_LOCATOR_DIGEST)
      this.keyData = new Buffer(input);
    else if (type == KeyLocatorType.KEY) {
      this.keyData = new Buffer(input);
      // Set for backwards compatibility.
      this.publicKey = this.keyData;
    }
    else if (type == KeyLocatorType.CERTIFICATE) {
      this.keyData = new Buffer(input);
      // Set for backwards compatibility.
      this.certificate = this.keyData;
    }
  }
};

exports.KeyLocator = KeyLocator;

/**
 * Get the key locator type. If KeyLocatorType.KEYNAME, you may also
 * getKeyName().  If KeyLocatorType.KEY_LOCATOR_DIGEST, you may also
 * getKeyData() to get the digest.
 * @returns {number} The key locator type, or null if not specified.
 */
KeyLocator.prototype.getType = function() { return this.type; };

/**
 * Get the key name.  This is meaningful if getType() is KeyLocatorType.KEYNAME.
 * @returns {Name} The key name. If not specified, the Name is empty.
 */
KeyLocator.prototype.getKeyName = function()
{
  if (this.keyName == null)
    this.keyName = new KeyName();
  if (this.keyName.contentName == null)
    this.keyName.contentName = new Name();

  return this.keyName.contentName;
};

/**
 * Get the key data. If getType() is KeyLocatorType.KEY_LOCATOR_DIGEST, this is
 * the digest bytes. If getType() is KeyLocatorType.KEY, this is the DER
 * encoded public key. If getType() is KeyLocatorType.CERTIFICATE, this is the
 * DER encoded certificate.
 * @returns {Blob} The key data, or null if not specified.
 */
KeyLocator.prototype.getKeyData = function()
{
  // For temporary backwards compatibility, leave the fields as a Buffer but return a Blob.
  return new Blob(this.getKeyDataAsBuffer(), false);
};

/**
 * @deprecated Use getKeyData. This method returns a Buffer which is the former
 * behavior of getKeyData, and should only be used while updating your code.
 */
KeyLocator.prototype.getKeyDataAsBuffer = function()
{
  if (this.type == KeyLocatorType.KEY)
    return this.publicKey;
  else if (this.type == KeyLocatorType.CERTIFICATE)
    return this.certificate;
  else
    return this.keyData;
};

/**
 * Set the key locator type.  If KeyLocatorType.KEYNAME, you must also
 * setKeyName().  If KeyLocatorType.KEY_LOCATOR_DIGEST, you must also
 * setKeyData() to the digest.
 * @param {number} type The key locator type.  If null, the type is unspecified.
 */
KeyLocator.prototype.setType = function(type) { this.type = type; };

/**
 * Set key name to a copy of the given Name.  This is the name if getType()
 * is KeyLocatorType.KEYNAME.
 * @param {Name} name The key name which is copied.
 */
KeyLocator.prototype.setKeyName = function(name)
{
  if (this.keyName == null)
    this.keyName = new KeyName();

  this.keyName.contentName = typeof name === 'object' && name instanceof Name ?
                             new Name(name) : new Name();
};

/**
 * Set the key data to the given value. This is the digest bytes if getType() is
 * KeyLocatorType.KEY_LOCATOR_DIGEST.
 * @param {Blob} keyData A Blob with the key data bytes.
 */
KeyLocator.prototype.setKeyData = function(keyData)
{
  var value = keyData;
  if (value != null) {
    if (typeof value === 'object' && value instanceof Blob)
      value = new Buffer(value.buf());
    else
      // Make a copy.
      value = new Buffer(value);
  }

  this.keyData = value;
  // Set for backwards compatibility.
  this.publicKey = value;
  this.certificate = value;
};

/**
 * Clear the keyData and set the type to none.
 */
KeyLocator.prototype.clear = function()
{
  this.type = null;
  this.keyName = null;
  this.keyData = null;
  this.publicKey = null;
  this.certificate = null;
};

KeyLocator.prototype.from_ndnb = function(decoder) {

  decoder.readElementStartDTag(this.getElementLabel());

  if (decoder.peekDTag(NDNProtocolDTags.Key))
  {
    try {
      var encodedKey = decoder.readBinaryDTagElement(NDNProtocolDTags.Key);
      // This is a DER-encoded SubjectPublicKeyInfo.

      //TODO FIX THIS, This should create a Key Object instead of keeping bytes

      this.publicKey =   encodedKey;//CryptoUtil.getPublicKey(encodedKey);
      this.type = KeyLocatorType.KEY;

      if (LOG > 4) console.log('PUBLIC KEY FOUND: '+ this.publicKey);
    }
    catch (e) {
      throw new Error("Cannot parse key: ", e);
    }

    if (null == this.publicKey)
      throw new Error("Cannot parse key: ");
  }
  else if (decoder.peekDTag(NDNProtocolDTags.Certificate)) {
    try {
      var encodedCert = decoder.readBinaryDTagElement(NDNProtocolDTags.Certificate);

      /*
       * Certificates not yet working
       */

      this.certificate = encodedCert;
      this.type = KeyLocatorType.CERTIFICATE;

      if (LOG > 4) console.log('CERTIFICATE FOUND: '+ this.certificate);
    }
    catch (e) {
      throw new Error("Cannot decode certificate: " +  e);
    }
    if (null == this.certificate)
      throw new Error("Cannot parse certificate! ");
  } else  {
    this.type = KeyLocatorType.KEYNAME;

    this.keyName = new KeyName();
    this.keyName.from_ndnb(decoder);
  }
  decoder.readElementClose();
};

KeyLocator.prototype.to_ndnb = function(encoder)
{
  if (LOG > 4) console.log('type is is ' + this.type);

  if (this.type == KeyLocatorType.KEY_LOCATOR_DIGEST)
    // encodeSignedInfo already encoded this as the publisherPublicKeyDigest,
    //   so do nothing here.
    return;

  encoder.writeElementStartDTag(this.getElementLabel());

  if (this.type == KeyLocatorType.KEY) {
    if (LOG > 5) console.log('About to encode a public key' +this.publicKey);
    encoder.writeDTagElement(NDNProtocolDTags.Key, this.publicKey);
  }
  else if (this.type == KeyLocatorType.CERTIFICATE) {
    try {
      encoder.writeDTagElement(NDNProtocolDTags.Certificate, this.certificate);
    }
    catch (e) {
      throw new Error("CertificateEncodingException attempting to write key locator: " + e);
    }
  }
  else if (this.type == KeyLocatorType.KEYNAME)
    this.keyName.to_ndnb(encoder);

  encoder.writeElementClose();
};

KeyLocator.prototype.getElementLabel = function()
{
  return NDNProtocolDTags.KeyLocator;
};

/**
 * KeyName is only used by KeyLocator.
 * @constructor
 */
var KeyName = function KeyName()
{
  this.contentName = new Name();  //contentName
  this.publisherID = this.publisherID;  //publisherID
};

exports.KeyName = KeyName;

KeyName.prototype.from_ndnb = function(decoder)
{
  decoder.readElementStartDTag(this.getElementLabel());

  this.contentName = new Name();
  this.contentName.from_ndnb(decoder);

  if (LOG > 4) console.log('KEY NAME FOUND: ');

  if (PublisherID.peek(decoder)) {
    this.publisherID = new PublisherID();
    this.publisherID.from_ndnb(decoder);
  }

  decoder.readElementClose();
};

KeyName.prototype.to_ndnb = function(encoder)
{
  encoder.writeElementStartDTag(this.getElementLabel());

  this.contentName.to_ndnb(encoder);
  if (null != this.publisherID)
    this.publisherID.to_ndnb(encoder);

  encoder.writeElementClose();
};

KeyName.prototype.getElementLabel = function() { return NDNProtocolDTags.KeyName; };


}).call(this,require("buffer").Buffer)
},{"./log.js":53,"./name.js":55,"./publisher-id.js":56,"./util/blob.js":77,"./util/ndn-protoco-id-tags.js":81,"buffer":3}],52:[function(require,module,exports){
(function (Buffer){
/**
 * This class represents Key Objects
 * Copyright (C) 2013-2014 Regents of the University of California.
 * @author: Meki Cheraoui
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 * A copy of the GNU General Public License is in the file COPYING.
 */

var DataUtils = require('./encoding/data-utils.js').DataUtils;
var LOG = require('./log.js').Log.LOG;

/**
 * @constructor
 */
/**
 * Key
 */
var Key = function Key()
{
  this.publicKeyDer = null;     // Buffer
  this.publicKeyDigest = null;  // Buffer
  this.publicKeyPem = null;     // String
  this.privateKeyPem = null;    // String
};

exports.Key = Key;

/**
 * Helper functions to read Key fields
 * TODO: generateRSA()
 */

Key.prototype.publicToDER = function()
{
  return this.publicKeyDer;  // Buffer
};

Key.prototype.privateToDER = function()
{
  // Remove the '-----XXX-----' from the beginning and the end of the key
  // and also remove any \n in the key string
  var lines = this.privateKeyPem.split('\n');
  priKey = "";
  for (var i = 1; i < lines.length - 1; i++)
    priKey += lines[i];

  return new Buffer(priKey, 'base64');
};

Key.prototype.publicToPEM = function()
{
  return this.publicKeyPem;
};

Key.prototype.privateToPEM = function()
{
  return this.privateKeyPem;
};

Key.prototype.getKeyID = function()
{
  return this.publicKeyDigest;
};

exports.Key = Key;

Key.prototype.readDerPublicKey = function(/*Buffer*/pub_der)
{
  if (LOG > 4) console.log("Encode DER public key:\n" + pub_der.toString('hex'));

  this.publicKeyDer = pub_der;

  var hash = require("crypto").createHash('sha256');
  hash.update(this.publicKeyDer);
  this.publicKeyDigest = new Buffer(DataUtils.toNumbersIfString(hash.digest()));

  var keyStr = pub_der.toString('base64');
  var keyPem = "-----BEGIN PUBLIC KEY-----\n";
  for (var i = 0; i < keyStr.length; i += 64)
  keyPem += (keyStr.substr(i, 64) + "\n");
  keyPem += "-----END PUBLIC KEY-----";
  this.publicKeyPem = keyPem;

  if (LOG > 4) console.log("Convert public key to PEM format:\n" + this.publicKeyPem);
};

/**
 * Load RSA key pair from PEM-encoded strings.
 * Will throw an Error if both 'pub' and 'pri' are null.
 */
Key.prototype.fromPemString = function(pub, pri)
{
  if (pub == null && pri == null)
    throw new Error('Cannot create Key object if both public and private PEM string is empty.');

  // Read public key
  if (pub != null) {
    this.publicKeyPem = pub;
    if (LOG > 4) console.log("Key.publicKeyPem: \n" + this.publicKeyPem);

    // Remove the '-----XXX-----' from the beginning and the end of the public key
    // and also remove any \n in the public key string
    var lines = pub.split('\n');
    pub = "";
    for (var i = 1; i < lines.length - 1; i++)
      pub += lines[i];
    this.publicKeyDer = new Buffer(pub, 'base64');
    if (LOG > 4) console.log("Key.publicKeyDer: \n" + this.publicKeyDer.toString('hex'));

    var hash = require("crypto").createHash('sha256');
    hash.update(this.publicKeyDer);
    this.publicKeyDigest = new Buffer(DataUtils.toNumbersIfString(hash.digest()));
    if (LOG > 4) console.log("Key.publicKeyDigest: \n" + this.publicKeyDigest.toString('hex'));
  }

  // Read private key
  if (pri != null) {
    this.privateKeyPem = pri;
    if (LOG > 4) console.log("Key.privateKeyPem: \n" + this.privateKeyPem);
  }
};

Key.prototype.fromPem = Key.prototype.fromPemString;

/**
 * Static method that create a Key object.
 * Parameter 'obj' is a JSON object that has two properties:
 *   pub: the PEM string for the public key
 *   pri: the PEM string for the private key
 * Will throw an Error if both obj.pub and obj.pri are null.
 */
Key.createFromPEM = function(obj)
{
    var key = new Key();
    key.fromPemString(obj.pub, obj.pri);
    return key;
};

}).call(this,require("buffer").Buffer)
},{"./encoding/data-utils.js":33,"./log.js":53,"buffer":3,"crypto":7}],53:[function(require,module,exports){
/**
 * Copyright (C) 2013-2014 Regents of the University of California.
 * @author: Jeff Thompson <jefft0@remap.ucla.edu>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 * A copy of the GNU General Public License is in the file COPYING.
 */

/**
 * The Log class holds the global static variable LOG.
 */
var Log = function Log()
{
}

exports.Log = Log;

/**
 * LOG is the level for logging debugging statements.  0 means no log messages.
 * @type Number
 */
Log.LOG = 0;

},{}],54:[function(require,module,exports){
(function (Buffer){
/**
 * This class represents an NDN Data MetaInfo object.
 * Copyright (C) 2014 Regents of the University of California.
 * @author: Meki Cheraoui
 * @author: Jeff Thompson <jefft0@remap.ucla.edu>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 * A copy of the GNU General Public License is in the file COPYING.
 */

var BinaryXMLEncoder = require('./encoding/binary-xml-encoder.js').BinaryXMLEncoder;
var BinaryXMLDecoder = require('./encoding/binary-xml-decoder.js').BinaryXMLDecoder;
var Blob = require('./util/blob.js').Blob;
var NDNProtocolDTags = require('./util/ndn-protoco-id-tags.js').NDNProtocolDTags;
var KeyLocator = require('./key-locator.js').KeyLocator;
var KeyLocatorType = require('./key-locator.js').KeyLocatorType;
var Name = require('./name.js').Name;
var PublisherPublicKeyDigest = require('./publisher-public-key-digest.js').PublisherPublicKeyDigest;
var NDNTime = require('./util/ndn-time.js').NDNTime;
var globalKeyManager = require('./security/key-manager.js').globalKeyManager;
var LOG = require('./log.js').Log.LOG;

var ContentType = {
  BLOB:0,
  // ContentType DATA is deprecated.  Use ContentType.BLOB .
  DATA:0,
  LINK:1,
  KEY: 2,
  // ContentType ENCR, GONE and NACK are not supported in NDN-TLV encoding and are deprecated.
  ENCR:3,
  GONE:4,
  NACK:5
};

exports.ContentType = ContentType;

/**
 * Create a new MetaInfo with the optional values.
 * @constructor
 */
var MetaInfo = function MetaInfo(publisherOrMetaInfo, timestamp, type, locator, freshnessSeconds, finalBlockID, skipSetFields)
{
  if (typeof publisherOrMetaInfo === 'object' &&
      publisherOrMetaInfo instanceof MetaInfo) {
    // Copy values.
    var metaInfo = publisherOrMetaInfo;
    this.publisher = metaInfo.publisher;
    this.timestamp = metaInfo.timestamp;
    this.type = metaInfo.type;
    this.locator = metaInfo.locator == null ?
      new KeyLocator() : new KeyLocator(metaInfo.locator);
    this.freshnessSeconds = metaInfo.freshnessSeconds;
    this.finalBlockID = metaInfo.finalBlockID;
  }
  else {
    this.publisher = publisherOrMetaInfo; //publisherPublicKeyDigest
    this.timestamp = timestamp; // NDN Time
    this.type = type == null || type < 0 ? ContentType.BLOB : type; // ContentType
    this.locator = locator == null ? new KeyLocator() : new KeyLocator(locator);
    this.freshnessSeconds = freshnessSeconds; // Integer
    this.finalBlockID = finalBlockID; //byte array

    if (!skipSetFields)
      this.setFields();
  }

  this.changeCount = 0;
};

exports.MetaInfo = MetaInfo;

/**
 * Get the content type.
 * @returns {number} The content type as an int from ContentType.
 */
MetaInfo.prototype.getType = function()
{
  return this.type;
};

/**
 * Get the freshness period.
 * @returns {number} The freshness period in milliseconds, or null if not
 * specified.
 */
MetaInfo.prototype.getFreshnessPeriod = function()
{
  // Use attribute freshnessSeconds for backwards compatibility.
  if (this.freshnessSeconds == null || this.freshnessSeconds < 0)
    return null;
  else
    // Convert to milliseconds.
    return this.freshnessSeconds * 1000.0;
};

/**
 * Get the final block ID.
 * @returns {Name.Component} The final block ID as a Name.Component. If the
 * Name.Component getValue().size() is 0, then the final block ID is not specified.
 */
MetaInfo.prototype.getFinalBlockID = function()
{
  // For backwards-compatibility, leave this.finalBlockID as a Buffer but return a Name.Component.
  return new Name.Component(new Blob(this.finalBlockID, true));
};

/**
 * @deprecated Use getFinalBlockID. This method returns a Buffer which is the former
 * behavior of getFinalBlockID, and should only be used while updating your code.
 */
MetaInfo.prototype.getFinalBlockIDAsBuffer = function()
{
  return this.finalBlockID;
};

/**
 * Set the content type.
 * @param {number} type The content type as an int from ContentType.  If null,
 * this uses ContentType.BLOB.
 */
MetaInfo.prototype.setType = function(type)
{
  this.type = type == null || type < 0 ? ContentType.BLOB : type;
  ++this.changeCount;
};

/**
 * Set the freshness period.
 * @param {type} freshnessPeriod The freshness period in milliseconds, or null
 * for not specified.
 */
MetaInfo.prototype.setFreshnessPeriod = function(freshnessPeriod)
{
  // Use attribute freshnessSeconds for backwards compatibility.
  if (freshnessPeriod == null || freshnessPeriod < 0)
    this.freshnessSeconds = null;
  else
    // Convert from milliseconds.
    this.freshnessSeconds = freshnessPeriod / 1000.0;
  ++this.changeCount;
};

MetaInfo.prototype.setFinalBlockID = function(finalBlockID)
{
  // TODO: finalBlockID should be a Name.Component, not Buffer.
  if (finalBlockID == null)
    this.finalBlockID = null;
  else if (typeof finalBlockID === 'object' && finalBlockID instanceof Blob)
    this.finalBlockID = finalBlockID.buf();
  else if (typeof finalBlockID === 'object' && finalBlockID instanceof Name.Component)
    this.finalBlockID = finalBlockID.getValue().buf();
  else
    this.finalBlockID = new Buffer(finalBlockID);
  ++this.changeCount;
};

MetaInfo.prototype.setFields = function()
{
  var key = globalKeyManager.getKey();
  this.publisher = new PublisherPublicKeyDigest(key.getKeyID());

  var d = new Date();

  var time = d.getTime();

  this.timestamp = new NDNTime(time);

  if (LOG > 4) console.log('TIME msec is');

  if (LOG > 4) console.log(this.timestamp.msec);

  //DATA
  this.type = ContentType.BLOB;

  if (LOG > 4) console.log('PUBLIC KEY TO WRITE TO DATA PACKET IS ');
  if (LOG > 4) console.log(key.publicToDER().toString('hex'));

  this.locator = new KeyLocator(key.getKeyID(), KeyLocatorType.KEY_LOCATOR_DIGEST);
  ++this.changeCount;
};

MetaInfo.prototype.from_ndnb = function(decoder)
{
  decoder.readElementStartDTag(this.getElementLabel());

  if (decoder.peekDTag(NDNProtocolDTags.PublisherPublicKeyDigest)) {
    if (LOG > 4) console.log('DECODING PUBLISHER KEY');
    this.publisher = new PublisherPublicKeyDigest();
    this.publisher.from_ndnb(decoder);
  }

  if (decoder.peekDTag(NDNProtocolDTags.Timestamp)) {
    if (LOG > 4) console.log('DECODING TIMESTAMP');
    this.timestamp = decoder.readDateTimeDTagElement(NDNProtocolDTags.Timestamp);
  }

  if (decoder.peekDTag(NDNProtocolDTags.Type)) {
    var binType = decoder.readBinaryDTagElement(NDNProtocolDTags.Type);

    if (LOG > 4) console.log('Binary Type of of Signed Info is '+binType);

    this.type = binType;

    //TODO Implement type of Key Reading
    if (null == this.type)
      throw new Error("Cannot parse signedInfo type: bytes.");
  }
  else
    this.type = ContentType.DATA; // default

  if (decoder.peekDTag(NDNProtocolDTags.FreshnessSeconds)) {
    this.freshnessSeconds = decoder.readIntegerDTagElement(NDNProtocolDTags.FreshnessSeconds);
    if (LOG > 4) console.log('FRESHNESS IN SECONDS IS '+ this.freshnessSeconds);
  }

  if (decoder.peekDTag(NDNProtocolDTags.FinalBlockID)) {
    if (LOG > 4) console.log('DECODING FINAL BLOCKID');
    this.finalBlockID = decoder.readBinaryDTagElement(NDNProtocolDTags.FinalBlockID);
  }

  if (decoder.peekDTag(NDNProtocolDTags.KeyLocator)) {
    if (LOG > 4) console.log('DECODING KEY LOCATOR');
    this.locator = new KeyLocator();
    this.locator.from_ndnb(decoder);
  }

  decoder.readElementClose();
  ++this.changeCount;
};

/**
 * Encode this MetaInfo in ndnb, using the given keyLocator instead of the
 * locator in this object.
 * @param {BinaryXMLEncoder} encoder The encoder.
 * @param {KeyLocator} keyLocator The key locator to use (from
 * Data.getSignatureOrMetaInfoKeyLocator).
 */
MetaInfo.prototype.to_ndnb = function(encoder, keyLocator)  {
  if (!this.validate())
    throw new Error("Cannot encode : field values missing.");

  encoder.writeElementStartDTag(this.getElementLabel());

  if (null != this.publisher) {
    // We have a publisherPublicKeyDigest, so use it.
    if (LOG > 3) console.log('ENCODING PUBLISHER KEY' + this.publisher.publisherPublicKeyDigest);
    this.publisher.to_ndnb(encoder);
  }
  else {
    if (null != keyLocator &&
        keyLocator.getType() == KeyLocatorType.KEY_LOCATOR_DIGEST &&
        !keyLocator.getKeyData().isNull() &&
        keyLocator.getKeyData().size() > 0)
      // We have a TLV-style KEY_LOCATOR_DIGEST, so encode as the
      //   publisherPublicKeyDigest.
      encoder.writeDTagElement
        (NDNProtocolDTags.PublisherPublicKeyDigest, keyLocator.getKeyData().buf());
  }

  if (null != this.timestamp)
    encoder.writeDateTimeDTagElement(NDNProtocolDTags.Timestamp, this.timestamp);

  if (null != this.type && this.type != 0)
    encoder.writeDTagElement(NDNProtocolDTags.type, this.type);

  if (null != this.freshnessSeconds)
    encoder.writeDTagElement(NDNProtocolDTags.FreshnessSeconds, this.freshnessSeconds);

  if (null != this.finalBlockID)
    encoder.writeDTagElement(NDNProtocolDTags.FinalBlockID, this.finalBlockID);

  if (null != keyLocator)
    keyLocator.to_ndnb(encoder);

  encoder.writeElementClose();
};

MetaInfo.prototype.valueToType = function()
{
  return null;
};

MetaInfo.prototype.getElementLabel = function() {
  return NDNProtocolDTags.SignedInfo;
};

MetaInfo.prototype.validate = function()
{
  // We don't do partial matches any more, even though encoder/decoder
  // is still pretty generous.
  if (null == this.timestamp)
    return false;
  return true;
};

/**
 * Get the change count, which is incremented each time this object is changed.
 * @returns {number} The change count.
 */
MetaInfo.prototype.getChangeCount = function()
{
  return this.changeCount;
};

/**
 * @deprecated Use new MetaInfo.
 */
var SignedInfo = function SignedInfo(publisherOrMetaInfo, timestamp, type, locator, freshnessSeconds, finalBlockID)
{
  // Call the base constructor.
  MetaInfo.call(this, publisherOrMetaInfo, timestamp, type, locator, freshnessSeconds, finalBlockID);
}

// Set skipSetFields true since we only need the prototype functions.
SignedInfo.prototype = new MetaInfo(null, null, null, null, null, null, true);

exports.SignedInfo = SignedInfo;

}).call(this,require("buffer").Buffer)
},{"./encoding/binary-xml-decoder.js":29,"./encoding/binary-xml-encoder.js":30,"./key-locator.js":51,"./log.js":53,"./name.js":55,"./publisher-public-key-digest.js":57,"./security/key-manager.js":66,"./util/blob.js":77,"./util/ndn-protoco-id-tags.js":81,"./util/ndn-time.js":82,"buffer":3}],55:[function(require,module,exports){
(function (Buffer){
/**
 * This class represents a Name as an array of components where each is a byte array.
 * Copyright (C) 2013-2014 Regents of the University of California.
 * @author: Meki Cheraoui, Jeff Thompson <jefft0@remap.ucla.edu>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 * A copy of the GNU General Public License is in the file COPYING.
 */

var Blob = require('./util/blob.js').Blob;
var DataUtils = require('./encoding/data-utils.js').DataUtils;
var BinaryXMLEncoder = require('./encoding/binary-xml-encoder.js').BinaryXMLEncoder;
var BinaryXMLDecoder = require('./encoding/binary-xml-decoder.js').BinaryXMLDecoder;
var NDNProtocolDTags = require('./util/ndn-protoco-id-tags.js').NDNProtocolDTags;
var LOG = require('./log.js').Log.LOG;

/**
 * Create a new Name from components.
 *
 * @constructor
 * @param {string|Name|Array<string|Array<number>|ArrayBuffer|Buffer|Name>} components if a string, parse it as a URI.  If a Name, add a deep copy of its components.
 * Otherwise it is an array of components which are appended according to Name.append, so
 * convert each and store it as an array of Buffer.  If a component is a string, encode as utf8.
 */
var Name = function Name(components)
{
  if (typeof components == 'string') {
    if (LOG > 3) console.log('Content Name String ' + components);
    this.components = Name.createNameArray(components);
  }
  else if (typeof components === 'object') {
    this.components = [];
    if (components instanceof Name)
      this.append(components);
    else {
      for (var i = 0; i < components.length; ++i)
        this.append(components[i]);
    }
  }
  else if (components == null)
    this.components = [];
  else
    if (LOG > 1) console.log("NO CONTENT NAME GIVEN");

  this.changeCount = 0;
};

exports.Name = Name;

/**
 *
 * @constructor
 * Create a new Name.Component with a copy of the given value.
 * @param {Name.Component|String|Array<number>|ArrayBuffer|Buffer} value If the value is a string, encode it as utf8 (but don't unescape).
 */
Name.Component = function NameComponent(value)
{
  if (typeof value === 'string')
    this.value = DataUtils.stringToUtf8Array(value);
  else if (typeof value === 'object' && value instanceof Name.Component)
    this.value = new Buffer(value.value);
  else if (typeof value === 'object' && value instanceof Blob) {
    if (value.isNull())
      this.value = new Buffer(0);
    else
      this.value = new Buffer(value.buf());
  }
  else if (Buffer.isBuffer(value))
    this.value = new Buffer(value);
  else if (typeof value === 'object' && typeof ArrayBuffer !== 'undefined' &&  value instanceof ArrayBuffer) {
    // Make a copy.  Don't use ArrayBuffer.slice since it isn't always supported.
    this.value = new Buffer(new ArrayBuffer(value.byteLength));
    this.value.set(new Buffer(value));
  }
  else if (typeof value === 'object')
    // Assume value is a byte array.  We can't check instanceof Array because
    //   this doesn't work in JavaScript if the array comes from a different module.
    this.value = new Buffer(value);
  else if (!value)
    this.value = new Buffer(0);
  else
    throw new Error("Name.Component constructor: Invalid type");
}

/**
 * Get the component value.
 * @returns {Blob} The component value.
 */
Name.Component.prototype.getValue = function()
{
  // For temporary backwards compatibility, leave this.value as a Buffer but return a Blob.
  return new Blob(this.value, false);
}

/**
 * @deprecated Use getValue. This method returns a Buffer which is the former
 * behavior of getValue, and should only be used while updating your code.
 */
Name.Component.prototype.getValueAsBuffer = function()
{
  return this.value;
};

/**
 * Convert this component value to a string by escaping characters according to the NDN URI Scheme.
 * This also adds "..." to a value with zero or more ".".
 * @returns {string} The escaped string.
 */
Name.Component.prototype.toEscapedString = function()
{
  return Name.toEscapedString(this.value);
};

/**
 * Interpret this name component as a network-ordered number and return an integer.
 * @returns {number} The integer number.
 */
Name.Component.prototype.toNumber = function()
{
  return DataUtils.bigEndianToUnsignedInt(this.value);
};

/**
 * Interpret this name component as a network-ordered number with a marker and 
 * return an integer.
 * @param {number} marker The required first byte of the component.
 * @returns {number} The integer number.
 * @throws Error If the first byte of the component does not equal the marker.
 */
Name.Component.prototype.toNumberWithMarker = function(marker)
{
  if (this.value.length == 0 || this.value[0] != marker)
    throw new Error("Name component does not begin with the expected marker");

  return DataUtils.bigEndianToUnsignedInt(this.value.slice(1));
};

/**
 * Interpret this name component as a segment number according to NDN name
 * conventions (a network-ordered number where the first byte is the marker 0x00).
 * @returns {number} The integer segment number.
 * @throws Error If the first byte of the component is not the expected marker.
 */
Name.Component.prototype.toSegment = function()
{
  return this.toNumberWithMarker(0x00);
};

/**
 * Interpret this name component as a version number according to NDN name 
 * conventions (a network-ordered number where the first byte is the marker 0xFD).  
 * Note that this returns the exact number from the component without converting 
 * it to a time representation.
 * @returns {number} The integer version number.
 * @throws Error If the first byte of the component is not the expected marker.
 */
Name.Component.prototype.toVersion = function()
{
  return this.toNumberWithMarker(0xFD);
};

/**
 * Create a component whose value is the marker appended with the 
 * network-ordered encoding of the number. Note: if the number is zero, no bytes 
 * are used for the number - the result will have only the marker.
 * @param {number} number
 * @param {number} marker
 * @returns {Name.Component}
 */
Name.Component.fromNumberWithMarker = function(number, marker)
{
  var bigEndian = DataUtils.nonNegativeIntToBigEndian(number);
  // Put the marker byte in front.
  var value = new Buffer(bigEndian.length + 1);
  value[0] = marker;
  bigEndian.copy(value, 1);

  return new Name.Component(value);
};

/**
 * Check if this is the same component as other.
 * @param {Name.Component} other The other Component to compare with.
 * @returns {Boolean} true if the components are equal, otherwise false.
 */
Name.Component.prototype.equals = function(other)
{
  return DataUtils.arraysEqual(this.value, other.value);
};

/**
 * Compare this to the other Component using NDN canonical ordering.
 * @param {Name.Component} other The other Component to compare with.
 * @returns {number} 0 if they compare equal, -1 if this comes before other in
 * the canonical ordering, or 1 if this comes after other in the canonical
 * ordering.
 *
 * @see http://named-data.net/doc/0.2/technical/CanonicalOrder.html
 */
Name.Component.prototype.compare = function(other)
{
  return Name.Component.compareBuffers(this.value, other.value);
};

/**
 * Do the work of Name.Component.compare to compare the component buffers.
 * @param {Buffer} component1
 * @param {Buffer} component2
 * @returns {number} 0 if they compare equal, -1 if component1 comes before
 * component2 in the canonical ordering, or 1 if component1 comes after
 * component2 in the canonical ordering.
 */
Name.Component.compareBuffers = function(component1, component2)
{
  if (component1.length < component2.length)
    return -1;
  if (component1.length > component2.length)
    return 1;

  for (var i = 0; i < component1.length; ++i) {
    if (component1[i] < component2[i])
      return -1;
    if (component1[i] > component2[i])
      return 1;
  }

  return 0;
};

/**
 * @deprecated Use toUri.
 */
Name.prototype.getName = function()
{
  return this.toUri();
};

/** Parse uri as a URI and return an array of Buffer components.
 */
Name.createNameArray = function(uri)
{
  uri = uri.trim();
  if (uri.length <= 0)
    return [];

  var iColon = uri.indexOf(':');
  if (iColon >= 0) {
    // Make sure the colon came before a '/'.
    var iFirstSlash = uri.indexOf('/');
    if (iFirstSlash < 0 || iColon < iFirstSlash)
      // Omit the leading protocol such as ndn:
      uri = uri.substr(iColon + 1, uri.length - iColon - 1).trim();
  }

  if (uri[0] == '/') {
    if (uri.length >= 2 && uri[1] == '/') {
      // Strip the authority following "//".
      var iAfterAuthority = uri.indexOf('/', 2);
      if (iAfterAuthority < 0)
        // Unusual case: there was only an authority.
        return [];
      else
        uri = uri.substr(iAfterAuthority + 1, uri.length - iAfterAuthority - 1).trim();
    }
    else
      uri = uri.substr(1, uri.length - 1).trim();
  }

  var array = uri.split('/');

  // Unescape the components.
  for (var i = 0; i < array.length; ++i) {
    var value = Name.fromEscapedString(array[i]);

    if (value.isNull()) {
      // Ignore the illegal componenent.  This also gets rid of a trailing '/'.
      array.splice(i, 1);
      --i;
      continue;
    }
    else
      array[i] = new Name.Component(value);
  }

  return array;
};

/**
 * Parse the uri according to the NDN URI Scheme and set the name with the
 * components.
 * @param {string} uri The URI string.
 */
Name.prototype.set = function(uri)
{
  this.components = Name.createNameArray(uri);
  ++this.changeCount;
};

Name.prototype.from_ndnb = function(/*XMLDecoder*/ decoder)
{
  decoder.readElementStartDTag(this.getElementLabel());

  this.components = [];

  while (decoder.peekDTag(NDNProtocolDTags.Component))
    this.append(decoder.readBinaryDTagElement(NDNProtocolDTags.Component));

  decoder.readElementClose();
  ++this.changeCount;
};

Name.prototype.to_ndnb = function(/*XMLEncoder*/ encoder)
{
  if (this.components == null)
    throw new Error("CANNOT ENCODE EMPTY CONTENT NAME");

  encoder.writeElementStartDTag(this.getElementLabel());
  var count = this.size();
  for (var i=0; i < count; i++)
    encoder.writeDTagElement(NDNProtocolDTags.Component, this.components[i].getValue().buf());

  encoder.writeElementClose();
};

Name.prototype.getElementLabel = function()
{
  return NDNProtocolDTags.Name;
};

/**
 * Convert the component to a Buffer and append to this Name.
 * Return this Name object to allow chaining calls to add.
 * @param {Name.Component|String|Array<number>|ArrayBuffer|Buffer|Name} component If a component is a string, encode as utf8 (but don't unescape).
 * @returns {Name}
 */
Name.prototype.append = function(component)
{
  if (typeof component == 'object' && component instanceof Name) {
    var components;
    if (component == this)
      // special case, when we need to create a copy
      components = this.components.slice(0, this.components.length);
    else
      components = component.components;

    for (var i = 0; i < components.length; ++i)
      this.components.push(new Name.Component(components[i]));
  }
  else
    // Just use the Name.Component constructor.
    this.components.push(new Name.Component(component));

  ++this.changeCount;
  return this;
};

/**
 * @deprecated Use append.
 */
Name.prototype.add = function(component)
{
  return this.append(component);
};

/**
 * Clear all the components.
 */
Name.prototype.clear = function()
{
  this.components = [];
  ++this.changeCount;
};

/**
 * Return the escaped name string according to "NDNx URI Scheme".
 * @returns {String}
 */
Name.prototype.toUri = function()
{
  if (this.size() == 0)
    return "/";

  var result = "";

  for (var i = 0; i < this.size(); ++i)
    result += "/"+ Name.toEscapedString(this.components[i].getValue().buf());

  return result;
};

/**
 * @deprecated Use toUri.
 */
Name.prototype.to_uri = function()
{
  return this.toUri();
};

/**
 * Append a component with the encoded segment number.
 * @param {number} segment The segment number.
 * @returns {Name} This name so that you can chain calls to append.
 */
Name.prototype.appendSegment = function(segment)
{
  return this.append(Name.Component.fromNumberWithMarker(segment, 0x00));
};

/**
 * Append a component with the encoded version number.
 * Note that this encodes the exact value of version without converting from a
 * time representation.
 * @param {number} version The version number.
 * @returns {Name} This name so that you can chain calls to append.
 */
Name.prototype.appendVersion = function(version)
{
  return this.append(Name.Component.fromNumberWithMarker(segment, 0xFD));
};

/**
 * @deprecated Use appendSegment.
 */
Name.prototype.addSegment = function(number)
{
  return this.appendSegment(number);
};

/**
 * Get a new name, constructed as a subset of components.
 * @param {number} iStartComponent The index if the first component to get.
 * @param {number} (optional) nComponents The number of components starting at iStartComponent.  If omitted,
 * return components starting at iStartComponent until the end of the name.
 * @returns {Name} A new name.
 */
Name.prototype.getSubName = function(iStartComponent, nComponents)
{
  if (nComponents == undefined)
    nComponents = this.components.length - iStartComponent;

  var result = new Name();

  var iEnd = iStartComponent + nComponents;
  for (var i = iStartComponent; i < iEnd && i < this.components.length; ++i)
    result.components.push(this.components[i]);

  return result;
};

/**
 * Return a new Name with the first nComponents components of this Name.
 * @param {number} nComponents The number of prefix components.  If nComponents is -N then return the prefix up
 * to name.size() - N. For example getPrefix(-1) returns the name without the final component.
 * @returns {Name} A new name.
 */
Name.prototype.getPrefix = function(nComponents)
{
  if (nComponents < 0)
    return this.getSubName(0, this.components.length + nComponents);
  else
    return this.getSubName(0, nComponents);
};

/**
 * @deprecated Use getPrefix(-nComponents).
 */
Name.prototype.cut = function(nComponents)
{
  return new Name(this.components.slice(0, this.components.length - nComponents));
};

/**
 * Return the number of name components.
 * @returns {number}
 */
Name.prototype.size = function()
{
  return this.components.length;
};

/**
 * Get a Name Component by index number.
 * @param {Number} i The index of the component, starting from 0.  However, if i is negative, return the component
 * at size() - (-i).
 * @returns {Name.Component}
 */
Name.prototype.get = function(i)
{
  if (i >= 0) {
    if (i >= this.components.length)
      throw new Error("Name.get: Index is out of bounds");

    return new Name.Component(this.components[i]);
  }
  else {
    // Negative index.
    if (i < -this.components.length)
      throw new Error("Name.get: Index is out of bounds");

    return new Name.Component(this.components[this.components.length - (-i)]);
  }
};

/**
 * @deprecated Use size().
 */
Name.prototype.getComponentCount = function()
{
  return this.components.length;
};

/**
 * @deprecated To get just the component value array, use get(i).getValue().buf().
 */
Name.prototype.getComponent = function(i)
{
  return new Buffer(this.components[i].getValue().buf());
};

/**
 * The "file name" in a name is the last component that isn't blank and doesn't start with one of the
 *   special marker octets (for version, etc.).  Return the index in this.components of
 *   the file name, or -1 if not found.
 */
Name.prototype.indexOfFileName = function()
{
  for (var i = this.size() - 1; i >= 0; --i) {
    var component = this.components[i].getValue().buf();
    if (component.length <= 0)
      continue;

    if (component[0] == 0 || component[0] == 0xC0 || component[0] == 0xC1 ||
        (component[0] >= 0xF5 && component[0] <= 0xFF))
      continue;

    return i;
  }

  return -1;
};

/**
 * Compare this to the other Name using NDN canonical ordering.  If the first 
 * components of each name are not equal, this returns -1 if the first comes 
 * before the second using the NDN canonical ordering for name components, or 1 
 * if it comes after. If they are equal, this compares the second components of 
 * each name, etc.  If both names are the same up to the size of the shorter 
 * name, this returns -1 if the first name is shorter than the second or 1 if it 
 * is longer. For example, std::sort gives: /a/b/d /a/b/cc /c /c/a /bb .  This 
 * is intuitive because all names with the prefix /a are next to each other.  
 * But it may be also be counter-intuitive because /c comes before /bb according 
 * to NDN canonical ordering since it is shorter.
 * @param {Name} other The other Name to compare with.
 * @returns {boolean} If they compare equal, -1 if *this comes before other in
 * the canonical ordering, or 1 if *this comes after other in the canonical
 * ordering.
 *
 * @see http://named-data.net/doc/0.2/technical/CanonicalOrder.html
 */
Name.prototype.compare = function(other)
{
  for (var i = 0; i < this.size() && i < other.size(); ++i) {
    var comparison = this.components[i].compare(other.components[i]);
    if (comparison == 0)
      // The components at this index are equal, so check the next components.
      continue;

    // Otherwise, the result is based on the components at this index.
    return comparison;
  }

  // The components up to min(this.size(), other.size()) are equal, so the
  // shorter name is less.
  if (this.size() < other.size())
    return -1;
  else if (this.size() > other.size())
    return 1;
  else
    return 0;
};

/**
 * Return true if this Name has the same components as name.
 */
Name.prototype.equals = function(name)
{
  if (this.components.length != name.components.length)
    return false;

  // Start from the last component because they are more likely to differ.
  for (var i = this.components.length - 1; i >= 0; --i) {
    if (!this.components[i].equals(name.components[i]))
      return false;
  }

  return true;
};

/**
 * @deprecated Use equals.
 */
Name.prototype.equalsName = function(name)
{
  return this.equals(name);
};

/**
 * Find the last component in name that has a ContentDigest and return the digest value as Buffer,
 *   or null if not found.  See Name.getComponentContentDigestValue.
 */
Name.prototype.getContentDigestValue = function()
{
  for (var i = this.size() - 1; i >= 0; --i) {
    var digestValue = Name.getComponentContentDigestValue(this.components[i]);
    if (digestValue != null)
      return digestValue;
  }

  return null;
};

/**
 * If component is a ContentDigest, return the digest value as a Buffer slice (don't modify!).
 * If not a ContentDigest, return null.
 * A ContentDigest component is Name.ContentDigestPrefix + 32 bytes + Name.ContentDigestSuffix.
 */
Name.getComponentContentDigestValue = function(component)
{
  if (typeof component == 'object' && component instanceof Name.Component)
    component = component.getValue().buf();

  var digestComponentLength = Name.ContentDigestPrefix.length + 32 + Name.ContentDigestSuffix.length;
  // Check for the correct length and equal ContentDigestPrefix and ContentDigestSuffix.
  if (component.length == digestComponentLength &&
      DataUtils.arraysEqual(component.slice(0, Name.ContentDigestPrefix.length),
                            Name.ContentDigestPrefix) &&
      DataUtils.arraysEqual(component.slice
         (component.length - Name.ContentDigestSuffix.length, component.length),
                            Name.ContentDigestSuffix))
   return component.slice(Name.ContentDigestPrefix.length, Name.ContentDigestPrefix.length + 32);
 else
   return null;
};

// Meta GUID "%C1.M.G%C1" + ContentDigest with a 32 byte BLOB.
Name.ContentDigestPrefix = new Buffer([0xc1, 0x2e, 0x4d, 0x2e, 0x47, 0xc1, 0x01, 0xaa, 0x02, 0x85]);
Name.ContentDigestSuffix = new Buffer([0x00]);


/**
 * Return value as an escaped string according to "NDNx URI Scheme".
 * We can't use encodeURIComponent because that doesn't encode all the characters we want to.
 * @param {Buffer|Name.Component} component The value or Name.Component to escape.
 * @returns {string} The escaped string.
 */
Name.toEscapedString = function(value)
{
  if (typeof value == 'object' && value instanceof Name.Component)
    value = value.getValue().buf();
  else if (typeof value === 'object' && value instanceof Blob)
    value = value.buf();

  var result = "";
  var gotNonDot = false;
  for (var i = 0; i < value.length; ++i) {
    if (value[i] != 0x2e) {
      gotNonDot = true;
      break;
    }
  }
  if (!gotNonDot) {
    // Special case for component of zero or more periods.  Add 3 periods.
    result = "...";
    for (var i = 0; i < value.length; ++i)
      result += ".";
  }
  else {
    for (var i = 0; i < value.length; ++i) {
      var x = value[i];
      // Check for 0-9, A-Z, a-z, (+), (-), (.), (_)
      if (x >= 0x30 && x <= 0x39 || x >= 0x41 && x <= 0x5a ||
          x >= 0x61 && x <= 0x7a || x == 0x2b || x == 0x2d ||
          x == 0x2e || x == 0x5f)
        result += String.fromCharCode(x);
      else
        result += "%" + (x < 16 ? "0" : "") + x.toString(16).toUpperCase();
    }
  }
  return result;
};

/**
 * Make a blob value by decoding the escapedString according to "NDNx URI Scheme".
 * If escapedString is "", "." or ".." then return null, which means to skip the component in the name.
 * @param {string} escapedString The escaped string to decode.
 * @returns {Blob} The unescaped Blob value. If the escapedString is not a valid
 * escaped component, then the Blob isNull().
 */
Name.fromEscapedString = function(escapedString)
{
  var value = unescape(escapedString.trim());

  if (value.match(/[^.]/) == null) {
    // Special case for value of only periods.
    if (value.length <= 2)
      // Zero, one or two periods is illegal.  Ignore this componenent to be
      //   consistent with the C implementation.
      return new Blob();
    else
      // Remove 3 periods.
      return new Blob
        (DataUtils.toNumbersFromString(value.substr(3, value.length - 3)), false);
  }
  else
    return new Blob(DataUtils.toNumbersFromString(value), false);
};

/**
 * @deprecated Use fromEscapedString. This method returns a Buffer which is the former
 * behavior of fromEscapedString, and should only be used while updating your code.
 */
Name.fromEscapedStringAsBuffer = function(escapedString)
{
  return Name.fromEscapedString(escapedString).buf();
};

/**
 * Return true if the N components of this name are the same as the first N components of the given name.
 * @param {Name} name The name to check.
 * @returns {Boolean} true if this matches the given name.  This always returns true if this name is empty.
 */
Name.prototype.match = function(name)
{
  var i_name = this.components;
  var o_name = name.components;

  // This name is longer than the name we are checking it against.
  if (i_name.length > o_name.length)
    return false;

  // Check if at least one of given components doesn't match.
  for (var i = 0; i < i_name.length; ++i) {
    if (!i_name[i].equals(o_name[i]))
      return false;
  }

  return true;
};

/**
 * Get the change count, which is incremented each time this object is changed.
 * @returns {number} The change count.
 */
Name.prototype.getChangeCount = function()
{
  return this.changeCount;
};

}).call(this,require("buffer").Buffer)
},{"./encoding/binary-xml-decoder.js":29,"./encoding/binary-xml-encoder.js":30,"./encoding/data-utils.js":33,"./log.js":53,"./util/blob.js":77,"./util/ndn-protoco-id-tags.js":81,"buffer":3}],56:[function(require,module,exports){
/**
 * This class represents Publisher and PublisherType Objects
 * Copyright (C) 2013-2014 Regents of the University of California.
 * @author: Meki Cheraoui
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 * A copy of the GNU General Public License is in the file COPYING.
 */

var NDNProtocolDTags = require('./util/ndn-protoco-id-tags.js').NDNProtocolDTags;
var NDNProtocolDTagsStrings = require('./util/ndn-protoco-id-tags.js').NDNProtocolDTagsStrings;
var DecodingException = require('./encoding/decoding-exception.js').DecodingException;

/**
 * @constructor
 */
var PublisherType = function PublisherType(tag)
{
  this.KEY = NDNProtocolDTags.PublisherPublicKeyDigest;
  this.CERTIFICATE = NDNProtocolDTags.PublisherCertificateDigest;
  this.ISSUER_KEY = NDNProtocolDTags.PublisherIssuerKeyDigest;
  this.ISSUER_CERTIFICATE = NDNProtocolDTags.PublisherIssuerCertificateDigest;

  this.Tag = tag;
};

/**
 * @constructor
 */
var PublisherID = function PublisherID()
{
  this.PUBLISHER_ID_DIGEST_ALGORITHM = "SHA-256";
  this.PUBLISHER_ID_LEN = 256/8;

  //TODO, implement publisherID creation and key creation

  //TODO implement generatePublicKeyDigest
  this.publisherID =null;//= generatePublicKeyDigest(key);//ByteArray

  //TODO implement generate key
  //CryptoUtil.generateKeyID(PUBLISHER_ID_DIGEST_ALGORITHM, key);
  this.publisherType = null;//isIssuer ? PublisherType.ISSUER_KEY : PublisherType.KEY;//publisher Type

  this.changeCount = 0;
};

exports.PublisherID = PublisherID;

PublisherID.prototype.from_ndnb = function(decoder)
{
  // We have a choice here of one of 4 binary element types.
  var nextTag = PublisherID.peekAndGetNextDTag(decoder);

  this.publisherType = new PublisherType(nextTag);

  if (nextTag < 0)
    throw new Error("Invalid publisher ID, got unexpected type");

  this.publisherID = decoder.readBinaryDTagElement(nextTag);
  if (null == this.publisherID)
    throw new DecodingException(new Error("Cannot parse publisher ID of type : " + nextTag + "."));
  ++this.changeCount;
};

PublisherID.prototype.to_ndnb = function(encoder)
{
  if (!this.validate())
    throw new Error("Cannot encode " + this.getClass().getName() + ": field values missing.");

  encoder.writeDTagElement(this.getElementLabel(), this.publisherID);
};

/**
 * Peek the next DTag in the decoder and return it if it is a PublisherID DTag.
 * @param {BinaryXMLDecoder} decoder The BinaryXMLDecoder with the input to decode.
 * @returns {number} The PublisherID DTag or -1 if it is not one of them.
 */
PublisherID.peekAndGetNextDTag = function(decoder)
{
  if (decoder.peekDTag(NDNProtocolDTags.PublisherPublicKeyDigest))
    return             NDNProtocolDTags.PublisherPublicKeyDigest;
  if (decoder.peekDTag(NDNProtocolDTags.PublisherCertificateDigest))
    return             NDNProtocolDTags.PublisherCertificateDigest;
  if (decoder.peekDTag(NDNProtocolDTags.PublisherIssuerKeyDigest))
    return             NDNProtocolDTags.PublisherIssuerKeyDigest;
  if (decoder.peekDTag(NDNProtocolDTags.PublisherIssuerCertificateDigest))
    return             NDNProtocolDTags.PublisherIssuerCertificateDigest;

  return -1;
};

PublisherID.peek = function(/* XMLDecoder */ decoder)
{
  return PublisherID.peekAndGetNextDTag(decoder) >= 0;
};

PublisherID.prototype.getElementLabel = function()
{
  return this.publisherType.Tag;
};

PublisherID.prototype.validate = function()
{
  return null != id() && null != type();
};

/**
 * Get the change count, which is incremented each time this object is changed.
 * @returns {number} The change count.
 */
PublisherID.prototype.getChangeCount = function()
{
  return this.changeCount;
};

},{"./encoding/decoding-exception.js":34,"./util/ndn-protoco-id-tags.js":81}],57:[function(require,module,exports){
/**
 * This class represents PublisherPublicKeyDigest Objects
 * Copyright (C) 2013-2014 Regents of the University of California.
 * @author: Meki Cheraoui
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 * A copy of the GNU General Public License is in the file COPYING.
 */

var NDNProtocolDTags = require('./util/ndn-protoco-id-tags.js').NDNProtocolDTags;
var LOG = require('./log.js').Log.LOG;

/**
 * @constructor
 */
var PublisherPublicKeyDigest = function PublisherPublicKeyDigest(pkd)
{
  this.PUBLISHER_ID_LEN = 512/8;
  this.publisherPublicKeyDigest = pkd;

  this.changeCount = 0;
};

exports.PublisherPublicKeyDigest = PublisherPublicKeyDigest;

PublisherPublicKeyDigest.prototype.from_ndnb = function(decoder)
{
  this.publisherPublicKeyDigest = decoder.readBinaryDTagElement(this.getElementLabel());

  if (LOG > 4) console.log('Publisher public key digest is ' + this.publisherPublicKeyDigest);

  if (null == this.publisherPublicKeyDigest)
    throw new Error("Cannot parse publisher key digest.");

  //TODO check if the length of the PublisherPublicKeyDigest is correct (Security reason)

  if (this.publisherPublicKeyDigest.length != this.PUBLISHER_ID_LEN) {
    if (LOG > 0)
      console.log('LENGTH OF PUBLISHER ID IS WRONG! Expected ' + this.PUBLISHER_ID_LEN + ", got " + this.publisherPublicKeyDigest.length);

    //this.publisherPublicKeyDigest = new PublisherPublicKeyDigest(this.PublisherPublicKeyDigest).PublisherKeyDigest;
  }
  ++this.changeCount;
};

PublisherPublicKeyDigest.prototype.to_ndnb= function(encoder)
{
  //TODO Check that the ByteArray for the key is present
  if (!this.validate())
    throw new Error("Cannot encode : field values missing.");

  if (LOG > 3) console.log('PUBLISHER KEY DIGEST IS'+this.publisherPublicKeyDigest);
  encoder.writeDTagElement(this.getElementLabel(), this.publisherPublicKeyDigest);
};

PublisherPublicKeyDigest.prototype.getElementLabel = function() { return NDNProtocolDTags.PublisherPublicKeyDigest; };

PublisherPublicKeyDigest.prototype.validate = function()
{
    return null != this.publisherPublicKeyDigest;
};

/**
 * Get the change count, which is incremented each time this object is changed.
 * @returns {number} The change count.
 */
PublisherPublicKeyDigest.prototype.getChangeCount = function()
{
  return this.changeCount;
};

},{"./log.js":53,"./util/ndn-protoco-id-tags.js":81}],58:[function(require,module,exports){
/**
 * Copyright (C) 2014 Regents of the University of California.
 * @author: Jeff Thompson <jefft0@remap.ucla.edu>
 * From ndn-cxx security by Yingdi Yu <yingdi@cs.ucla.edu>.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 * A copy of the GNU General Public License is in the file COPYING.
 */

var IdentityCertificate = function IdentityCertificate()
{
};

exports.IdentityCertificate = IdentityCertificate;

/**
 * Get the public key name from the full certificate name.
 * @param {Name} certificateName The full certificate name.
 * @returns {Name} The related public key name.
 */
IdentityCertificate.certificateNameToPublicKeyName = function(certificateName)
{
  var i = certificateName.size() - 1;
  var idString = "ID-CERT";
  while (i >= 0) {
    if (certificateName.get(i).toEscapedString() == idString)
      break;
    i -= 1;
  }

  var tmpName = certificateName.getSubName(0, i);
  var keyString = "KEY";
  for (var i = 0; i < tmpName.size(); ++i) {
    if (tmpName.get(i).toEscapedString() == keyString)
      break;
  }

  return tmpName.getSubName(0, i).append
    (tmpName.getSubName(i + 1, tmpName.size() - i - 1));
};

},{}],59:[function(require,module,exports){
/**
 * Copyright (C) 2014 Regents of the University of California.
 * @author: Jeff Thompson <jefft0@remap.ucla.edu>
 * From ndn-cxx security by Yingdi Yu <yingdi@cs.ucla.edu>.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 * A copy of the GNU General Public License is in the file COPYING.
 */

var SecurityException = require('../security-exception.js').SecurityException;
var KeyType = require('../security-types.js').KeyType;

/**
 * A PublicKey holds an encoded public key for use by the security library.
 * Create a new PublicKey with the given values.
 * @param {number} keyType The integer from KeyType, such as KeyType.RSA.
 * @param {Blob} keyDer The blob of the PublicKeyInfo in terms of DER.
 */
var PublicKey = function PublicKey(keyType, keyDer)
{
  this.keyType = keyType;
  this.keyDer = keyDer;
};

exports.PublicKey = PublicKey;

/**
 * Encode the public key into DER.
 * @returns {DerNode} The encoded DER syntax tree.
 */
PublicKey.prototype.toDer = function()
{
  throw new Error("PublicKey.toDer is not implemented");
};

/**
 * Decode the public key from the DER blob.
 * @param {number} keyType The integer from KeyType, such as KeyType.RSA.
 * @param {Blob} keyDer The DER blob.
 * @returns {PublicKey} The decoded public key.
 */
PublicKey.fromDer = function(keyType, keyDer)
{
  if (keyType == KeyType.RSA) {
    // TODO: Make sure we can decode the public key DER.
  }
  else
    throw new SecurityException(new Error
      ("PublicKey::fromDer: Unrecognized keyType"));

  return new PublicKey(keyType, keyDer);
};

/**
 * 
 * @param {number} digestAlgorithm (optional) The integer from DigestAlgorithm, 
 * such as DigestAlgorithm.SHA256. If omitted, use DigestAlgorithm.SHA256 .
 * @returns {Blob} The digest value.
 */
PublicKey.prototype.getDigest = function(digestAlgorithm)
{
  throw new Error("PublicKey.getDigest is not implemented");
};

/**
 * Get the key type.
 * @returns {number} The key type as an int from KeyType.
 */
PublicKey.prototype.getKeyType = function()
{
  return this.keyType;
};

/**
 * Get the raw bytes of the public key in DER format.
 * @returns {Blob} The public key DER.
 */
PublicKey.prototype.getKeyDer = function()
{
  return this.keyDer;
};

},{"../security-exception.js":71,"../security-types.js":72}],60:[function(require,module,exports){
(function (Buffer){
/**
 * Copyright (C) 2014 Regents of the University of California.
 * @author: Jeff Thompson <jefft0@remap.ucla.edu>
 * From ndn-cxx security by Yingdi Yu <yingdi@cs.ucla.edu>.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 * A copy of the GNU General Public License is in the file COPYING.
 */

var Name = require('../../name.js').Name;
var Data = require('../../data.js').Data;
var Sha256WithRsaSignature = require('../../sha256-with-rsa-signature.js').Sha256WithRsaSignature;
var KeyLocatorType = require('../../key-locator.js').KeyLocatorType;
var WireFormat = require('../../encoding/wire-format.js').WireFormat;
var SecurityException = require('../security-exception.js').SecurityException;

/**
 * An IdentityManager is the interface of operations related to identity, keys,
 * and certificates.
 *
 * Create a new IdentityManager to use the given IdentityStorage and
 * PrivateKeyStorage.
 * @param {IdentityStorage} identityStorage An object of a subclass of
 * IdentityStorage.
 * @param {PrivateKeyStorage} privateKeyStorage An object of a subclass of
 * PrivateKeyStorage.
 * @constructor
 */
var IdentityManager = function IdentityManager
  (identityStorage, privateKeyStorage)
{
  this.identityStorage = identityStorage;
  this.privateKeyStorage = privateKeyStorage;
};

exports.IdentityManager = IdentityManager;

/**
 * Create an identity by creating a pair of Key-Signing-Key (KSK) for this
 * identity and a self-signed certificate of the KSK.
 * @param {Name} identityName The name of the identity.
 * @returns {Name} The key name of the auto-generated KSK of the identity.
 */
IdentityManager.prototype.createIdentity = function(identityName)
{
  throw new Error("IdentityManager.createIdentity is not implemented");
};

/**
 * Get the default identity.
 * @returns {Name} The name of default identity.
 * @throws SecurityException if the default identity is not set.
 */
IdentityManager.prototype.getDefaultIdentity = function()
{
  return this.identityStorage.getDefaultIdentity();
};

/**
 * Generate a pair of RSA keys for the specified identity.
 * @param {Name} identityName The name of the identity.
 * @param {boolean} isKsk (optional) true for generating a Key-Signing-Key (KSK),
 * false for a Data-Signing-Key (DSK). If omitted, generate a Data-Signing-Key.
 * @param {number} keySize (optional) The size of the key. If omitted, use a
 * default secure key size.
 * @returns {Name} The generated key name.
 */
IdentityManager.prototype.generateRSAKeyPair = function
  (identityName, isKsk, keySize)
{
  throw new Error("IdentityManager.generateRSAKeyPair is not implemented");
};

/**
 * Set a key as the default key of an identity.
 * @param {Name} keyName The name of the key.
 * @param {Name} identityName (optional) the name of the identity. If not
 * specified, the identity name is inferred from the keyName.
 */
IdentityManager.prototype.setDefaultKeyForIdentity = function
  (keyName, identityName)
{
  if (identityName == null)
    identityName = new Name();
  this.identityStorage.setDefaultKeyNameForIdentity(keyName, identityName);
};

/**
 * Get the default key for an identity.
 * @param {Name} identityName The name of the identity.
 * @returns {Name} The default key name.
 * @throws SecurityException if the default key name for the identity is not set.
 */
IdentityManager.prototype.getDefaultKeyNameForIdentity = function(identityName)
{
  return this.identityStorage.getDefaultKeyNameForIdentity(identityName);
};

/**
 * Generate a pair of RSA keys for the specified identity and set it as default
 * key for the identity.
 * @param {Name} identityName The name of the identity.
 * @param {boolean} isKsk (optional) true for generating a Key-Signing-Key (KSK),
 * false for a Data-Signing-Key (DSK). If omitted, generate a Data-Signing-Key.
 * @param {number} keySize (optional) The size of the key. If omitted, use a
 * default secure key size.
 * @returns {Name} The generated key name.
 */
IdentityManager.prototype.generateRSAKeyPairAsDefault = function
  (identityName, isKsk, keySize)
{
  throw new Error("IdentityManager.generateRSAKeyPairAsDefault is not implemented");
};

/**
 * Get the public key with the specified name.
 * @param {Name} keyName The name of the key.
 * @returns {PublicKey} The public key.
 */
IdentityManager.prototype.getPublicKey = function(keyName)
{
  return PublicKey.fromDer
    (this.identityStorage.getKeyType(keyName),
     this.identityStorage.getKey(keyName));
};

// TODO: Add two versions of createIdentityCertificate.

/**
 * Add a certificate into the public key identity storage.
 * @param {IdentityCertificate} certificate The certificate to to added. This
 * makes a copy of the certificate.
 */
IdentityManager.prototype.addCertificate = function(certificate)
{
  this.identityStorage.addCertificate(certificate);
};

/**
 * Set the certificate as the default for its corresponding key.
 * @param {IdentityCertificate} certificate The certificate.
 */
IdentityManager.prototype.setDefaultCertificateForKey = function(certificate)
{
  var keyName = certificate.getPublicKeyName();

  if (!this.identityStorage.doesKeyExist(keyName))
      throw new SecurityException(new Error
        ("No corresponding Key record for certificate!"));

  this.identityStorage.setDefaultCertificateNameForKey
    (keyName, certificate.getName());
};

/**
 * Add a certificate into the public key identity storage and set the
 * certificate as the default for its corresponding identity.
 * @param {IdentityCertificate} certificate The certificate to be added. This
 * makes a copy of the certificate.
 */
IdentityManager.prototype.addCertificateAsIdentityDefault = function(certificate)
{
  this.identityStorage.addCertificate(certificate);
  var keyName = certificate.getPublicKeyName();
  this.setDefaultKeyForIdentity(keyName);
  this.setDefaultCertificateForKey(certificate);
};

/**
 * Add a certificate into the public key identity storage and set the
 * certificate as the default of its corresponding key.
 * @param {IdentityCertificate} certificate The certificate to be added.  This makes a copy of the certificate.
 */
IdentityManager.prototype.addCertificateAsDefault = function(certificate)
{
  this.identityStorage.addCertificate(certificate);
  this.setDefaultCertificateForKey(certificate);
};

/**
 * Get a certificate with the specified name.
 * @param {Name} certificateName The name of the requested certificate.
 * @returns {IdentityCertificate} the requested certificate which is valid.
 */
IdentityManager.prototype.getCertificate = function(certificateName)
{
  return new IdentityCertificate
    (this.identityStorage.getCertificate(certificateName, false));
};

/**
 * Get a certificate even if the certificate is not valid anymore.
 * @param {Name} certificateName The name of the requested certificate.
 * @returns {IdentityCertificate} the requested certificate.
 */
IdentityManager.prototype.getAnyCertificate = function(certificateName)
{
  return new IdentityCertificate
    (this.identityStorage.getCertificate(certificateName, true));
};

/**
 * Get the default certificate name for the specified identity, which will be
 * used when signing is performed based on identity.
 * @param {Name} identityName The name of the specified identity.
 * @returns {Name} The requested certificate name.
 * @throws SecurityException if the default key name for the identity is not
 * set or the default certificate name for the key name is not set.
 */
IdentityManager.prototype.getDefaultCertificateNameForIdentity = function
  (identityName)
{
  return this.identityStorage.getDefaultCertificateNameForIdentity(identityName);
};

/**
 * Get the default certificate name of the default identity, which will be used when signing is based on identity and
 * the identity is not specified.
 * @returns {Name} The requested certificate name.
 * @throws SecurityException if the default identity is not set or the default
 * key name for the identity is not set or the default certificate name for
 * the key name is not set.
 */
IdentityManager.prototype.getDefaultCertificateName = function()
{
  return this.identityStorage.getDefaultCertificateNameForIdentity
    (this.getDefaultIdentity());
};

/**
 * Sign the byte array data based on the certificate name.
 * @param {Buffer} target If this is a Data object, wire encode for signing,
 * update its signature and key locator field and wireEncoding. If it is an
 * array, sign it and return a Signature object.
 * @param {Name} certificateName The Name identifying the certificate which
 * identifies the signing key.
 * @param {WireFormat} (optional) The WireFormat for calling encodeData, or
 * WireFormat.getDefaultWireFormat() if omitted.
 * @returns {Signature} The generated signature.
 */
IdentityManager.prototype.signByCertificate = function
  (target, certificateName, wireFormat)
{
  wireFormat = (wireFormat || WireFormat.getDefaultWireFormat());

  if (target instanceof Data) {
    var data = target;
    var keyName = IdentityManager.certificateNameToPublicKeyName(certificateName);

    // For temporary usage, we support RSA + SHA256 only, but will support more.
    data.setSignature(new Sha256WithRsaSignature());
    // Get a pointer to the clone which Data made.
    var signature = data.getSignature();
    signature.getKeyLocator().setType(KeyLocatorType.KEYNAME);
    signature.getKeyLocator().setKeyName(certificateName.getPrefix(-1));

    // Set an empty signature so that we can encode.
    signature.setSignature(new Buffer(1));
    // Encode once to get the signed portion.
    var encoding = data.wireEncode(wireFormat);

    signature.setSignature(this.privateKeyStorage.sign
      (encoding.signedBuf(), keyName));

    // Encode again to include the signature.
    data.wireEncode(wireFormat);
  }
  else {
    var keyName = IdentityManager.certificateNameToPublicKeyName(certificateName);

    // For temporary usage, we support RSA + SHA256 only, but will support more.
    var signature = new Sha256WithRsaSignature();

    signature.getKeyLocator().setType(KeyLocatorType.KEYNAME);
    signature.getKeyLocator().setKeyName(certificateName.getPrefix(-1));

    signature.setSignature(this.privateKeyStorage.sign(target, keyName));

    return signature;
  }
};

/**
 * Generate a self-signed certificate for a public key.
 * @param {Name} keyName The name of the public key.
 * @returns {IdentityCertificate} The generated certificate.
 */
IdentityManager.prototype.selfSign = function(keyName)
{
  throw new Error("IdentityManager.selfSign is not implemented");
};

/**
 * Get the public key name from the full certificate name.
 *
 * @param {Name} certificateName The full certificate name.
 * @returns {Name} The related public key name.
 * TODO: Move this to IdentityCertificate
 */
IdentityManager.certificateNameToPublicKeyName = function(certificateName)
{
  var i = certificateName.size() - 1;
  var idString = "ID-CERT";
  while (i >= 0) {
    if (certificateName.get(i).toEscapedString() == idString)
      break;
    --i;
  }

  var tmpName = certificateName.getSubName(0, i);
  var keyString = "KEY";
  i = 0;
  while (i < tmpName.size()) {
    if (tmpName.get(i).toEscapedString() == keyString)
      break;
    ++i;
  }

  return tmpName.getSubName(0, i).append(tmpName.getSubName
    (i + 1, tmpName.size() - i - 1));
};
}).call(this,require("buffer").Buffer)
},{"../../data.js":28,"../../encoding/wire-format.js":44,"../../key-locator.js":51,"../../name.js":55,"../../sha256-with-rsa-signature.js":73,"../security-exception.js":71,"buffer":3}],61:[function(require,module,exports){
/**
 * Copyright (C) 2014 Regents of the University of California.
 * @author: Jeff Thompson <jefft0@remap.ucla.edu>
 * From ndn-cxx security by Yingdi Yu <yingdi@cs.ucla.edu>.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 * A copy of the GNU General Public License is in the file COPYING.
 */

var Name = require('../../name.js').Name;
var SecurityException = require('../security-exception.js').SecurityException;

/**
 * IdentityStorage is a base class for the storage of identity, public keys and
 * certificates. Private keys are stored in PrivateKeyStorage.
 * This is an abstract base class.  A subclass must implement the methods.
 * @constructor
 */
var IdentityStorage = function IdentityStorage()
{
};

exports.IdentityStorage = IdentityStorage;

/**
 * Check if the specified identity already exists.
 * @param {Name} identityName The identity name.
 * @returns {boolean} true if the identity exists, otherwise false.
 */
IdentityStorage.prototype.doesIdentityExist = function(identityName)
{
  throw new Error("IdentityStorage.doesIdentityExist is not implemented");
};

/**
 * Add a new identity. An exception will be thrown if the identity already exists.
 * @param {Name} identityName The identity name to be added.
 */
IdentityStorage.prototype.addIdentity = function(identityName)
{
  throw new Error("IdentityStorage.addIdentity is not implemented");
};

/**
 * Revoke the identity.
 * @returns {boolean} true if the identity was revoked, false if not.
 */
IdentityStorage.prototype.revokeIdentity = function()
{
  throw new Error("IdentityStorage.revokeIdentity is not implemented");
};

/**
 * Generate a name for a new key belonging to the identity.
 * @param {Name} identityName The identity name.
 * @param {boolean} useKsk If true, generate a KSK name, otherwise a DSK name.
 * @returns {Name} The generated key name.
 */
IdentityStorage.prototype.getNewKeyName = function(identityName, useKsk)
{
  var ti = new Date().getTime();
  // Get the number of seconds.
  var seconds = "" + Math.floor(ti / 1000.0);

  var keyIdStr;
  if (useKsk)
    keyIdStr = "KSK-" + seconds;
  else
    keyIdStr = "DSK-" + seconds;

  var keyName = new Name(identityName).append(keyIdStr);

  if (this.doesKeyExist(keyName))
    throw new SecurityException(new Error("Key name already exists"));

  return keyName;
};

/**
 * Check if the specified key already exists.
 * @param {Name} keyName The name of the key.
 * @returns {boolean} true if the key exists, otherwise false.
 */
IdentityStorage.prototype.doesKeyExist = function(keyName)
{
  throw new Error("IdentityStorage.doesKeyExist is not implemented");
};

/**
 * Add a public key to the identity storage.
 * @param {Name} keyName The name of the public key to be added.
 * @param {number} keyType Type of the public key to be added from KeyType, such
 * as KeyType.RSA..
 * @param {Blob} publicKeyDer A blob of the public key DER to be added.
 */
IdentityStorage.prototype.addKey = function(keyName, keyType, publicKeyDer)
{
  throw new Error("IdentityStorage.addKey is not implemented");
};

/**
 * Get the public key DER blob from the identity storage.
 * @param {Name} keyName The name of the requested public key.
 * @returns {Blob} The DER Blob.  If not found, return a Blob with a null pointer.
 */
IdentityStorage.prototype.getKey = function(keyName)
{
  throw new Error("IdentityStorage.getKey is not implemented");
};

/**
 * Get the KeyType of the public key with the given keyName.
 * @param {Name} keyName The name of the requested public key.
 * @returns {number} The KeyType, for example KEY_TYPE_RSA.
 */
IdentityStorage.prototype.getKeyType = function(keyName)
{
  throw new Error("IdentityStorage.getKeyType is not implemented");
};

/**
 * Activate a key.  If a key is marked as inactive, its private part will not be
 * used in packet signing.
 * @param {Name} keyName name of the key
 */
IdentityStorage.prototype.activateKey = function(keyName)
{
  throw new Error("IdentityStorage.activateKey is not implemented");
};

/**
 * Deactivate a key. If a key is marked as inactive, its private part will not
 * be used in packet signing.
 * @param {Name} keyName name of the key
 */
IdentityStorage.prototype.deactivateKey = function(keyName)
{
  throw new Error("IdentityStorage.deactivateKey is not implemented");
};

/**
 * Check if the specified certificate already exists.
 * @param {Name} certificateName The name of the certificate.
 * @returns {boolean} true if the certificate exists, otherwise false.
 */
IdentityStorage.prototype.doesCertificateExist = function(certificateName)
{
  throw new Error("IdentityStorage.doesCertificateExist is not implemented");
};

/**
 * Add a certificate to the identity storage.
 * @param {IdentityCertificate} certificate The certificate to be added.  This
 * makes a copy of the certificate.
 */
IdentityStorage.prototype.addCertificate = function(certificate)
{
  throw new Error("IdentityStorage.addCertificate is not implemented");
};

/**
 * Get a certificate from the identity storage.
 * @param {Name} certificateName The name of the requested certificate.
 * @param {boolean} allowAny (optional) If false, only a valid certificate will
 * be returned, otherwise validity is disregarded. If omitted, allowAny is false.
 * @returns {Data} The requested certificate.  If not found, return a shared_ptr
 * with a null pointer.
 */
IdentityStorage.prototype.getCertificate = function(certificateName, allowAny)
{
  throw new Error("IdentityStorage.getCertificate is not implemented");
};

/*****************************************
 *           Get/Set Default             *
 *****************************************/

/**
 * Get the default identity.
 * @returns {Name} The name of default identity.
 * @throws SecurityException if the default identity is not set.
 */
IdentityStorage.prototype.getDefaultIdentity = function()
{
  throw new Error("IdentityStorage.getDefaultIdentity is not implemented");
};

/**
 * Get the default key name for the specified identity.
 * @param {Name} identityName The identity name.
 * @returns {Name} The default key name.
 * @throws SecurityException if the default key name for the identity is not set.
 */
IdentityStorage.prototype.getDefaultKeyNameForIdentity = function(identityName)
{
  throw new Error("IdentityStorage.getDefaultKeyNameForIdentity is not implemented");
};

/**
 * Get the default certificate name for the specified identity.
 * @param {Name} identityName The identity name.
 * @returns {Name} The default certificate name.
 * @throws SecurityException if the default key name for the identity is not
 * set or the default certificate name for the key name is not set.
 */
IdentityStorage.prototype.getDefaultCertificateNameForIdentity = function
  (identityName)
{
  var keyName = this.getDefaultKeyNameForIdentity(identityName);
  return this.getDefaultCertificateNameForKey(keyName);
};

/**
 * Get the default certificate name for the specified key.
 * @param {Name} keyName The key name.
 * @returns {Name} The default certificate name.
 * @throws SecurityException if the default certificate name for the key name
 * is not set.
 */
IdentityStorage.prototype.getDefaultCertificateNameForKey = function(keyName)
{
  throw new Error("IdentityStorage.getDefaultCertificateNameForKey is not implemented");
};

/**
 * Set the default identity.  If the identityName does not exist, then clear the
 * default identity so that getDefaultIdentity() throws an exception.
 * @param {Name} identityName The default identity name.
 */
IdentityStorage.prototype.setDefaultIdentity = function(identityName)
{
  throw new Error("IdentityStorage.setDefaultIdentity is not implemented");
};

/**
 * Set the default key name for the specified identity.
 * @param {Name} keyName The key name.
 * @param {Name} identityNameCheck (optional) The identity name to check the
 * keyName.
 */
IdentityStorage.prototype.setDefaultKeyNameForIdentity = function
  (keyName, identityNameCheck)
{
  throw new Error("IdentityStorage.setDefaultKeyNameForIdentity is not implemented");
};

/**
 * Set the default key name for the specified identity.
 * @param {Name} keyName The key name.
 * @param {Name} certificateName The certificate name.
 */
IdentityStorage.prototype.setDefaultCertificateNameForKey = function
  (keyName, certificateName)
{
  throw new Error("IdentityStorage.setDefaultCertificateNameForKey is not implemented");
};

},{"../../name.js":55,"../security-exception.js":71}],62:[function(require,module,exports){
/**
 * Copyright (C) 2014 Regents of the University of California.
 * @author: Jeff Thompson <jefft0@remap.ucla.edu>
 * From ndn-cxx security by Yingdi Yu <yingdi@cs.ucla.edu>.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 * A copy of the GNU General Public License is in the file COPYING.
 */

var Data = require('../../data.js').Data;
var Name = require('../../name.js').Name;
var Blob = require('../../util/blob.js').Blob;
var KeyType = require('../security-types.js').KeyType;
var DataUtils = require('../../encoding/data-utils.js').DataUtils;
var SecurityException = require('../security-exception.js').SecurityException;
var IdentityStorage = require('./identity-storage.js').IdentityStorage;

/**
 * MemoryIdentityStorage extends IdentityStorage and implements its methods to
 * store identity, public key and certificate objects in memory. The application
 * must get the objects through its own means and add the objects to the
 * MemoryIdentityStorage object. To use permanent file-based storage, see
 * BasicIdentityStorage.
 * @constructor
 */
var MemoryIdentityStorage = function MemoryIdentityStorage()
{
  // Call the base constructor.
  IdentityStorage.call(this);

  // A list of name URI.
  this.identityStore = [];
  // The default identity in identityStore_, or "" if not defined.
  this.defaultIdentity = "";
  // The key is the keyName.toUri(). The value is the object
  //  {keyType, // number from KeyType
  //   keyDer   // Blob
  //  }.
  this.keyStore = {};
  // The key is the key is the certificateName.toUri(). The value is the
  //   encoded certificate.
  this.certificateStore = {};
};

MemoryIdentityStorage.prototype = new IdentityStorage();
MemoryIdentityStorage.prototype.name = "MemoryIdentityStorage";

exports.MemoryIdentityStorage = MemoryIdentityStorage;
/**
 * Check if the specified identity already exists.
 * @param {Name} identityName The identity name.
 * @returns {boolean} true if the identity exists, otherwise false.
 */
MemoryIdentityStorage.prototype.doesIdentityExist = function(identityName)
{
  return this.identityStore[identityName.toUri()] !== undefined;
};

/**
 * Add a new identity. An exception will be thrown if the identity already exists.
 * @param {Name} identityName The identity name to be added.
 */
MemoryIdentityStorage.prototype.addIdentity = function(identityName)
{
  var identityUri = identityName.toUri();
  if (this.identityStore.indexOf(identityUri) >= 0)
      throw new SecurityException(new Error
        ("Identity already exists: " + identityUri));

  this.identityStore.push(identityUri);
};

/**
 * Revoke the identity.
 * @returns {boolean} true if the identity was revoked, false if not.
 */
MemoryIdentityStorage.prototype.revokeIdentity = function()
{
  throw new Error("MemoryIdentityStorage.revokeIdentity is not implemented");
};

/**
 * Check if the specified key already exists.
 * @param {Name} keyName The name of the key.
 * @returns {boolean} true if the key exists, otherwise false.
 */
MemoryIdentityStorage.prototype.doesKeyExist = function(keyName)
{
  return this.keyStore[keyName.toUri()] !== undefined;
};

/**
 * Add a public key to the identity storage.
 * @param {Name} keyName The name of the public key to be added.
 * @param {number} keyType Type of the public key to be added from KeyType, such
 * as KeyType.RSA..
 * @param {Blob} publicKeyDer A blob of the public key DER to be added.
 */
MemoryIdentityStorage.prototype.addKey = function(keyName, keyType, publicKeyDer)
{
  var identityName = keyName.getSubName(0, keyName.size() - 1);

  if (!this.doesIdentityExist(identityName))
    this.addIdentity(identityName);

  if (this.doesKeyExist(keyName))
    throw new SecurityException(new Error
      ("A key with the same name already exists!"));

  this.keyStore[keyName.toUri()] =
    { keyType: keyType, keyDer: new Blob(publicKeyDer) };
};

/**
 * Get the public key DER blob from the identity storage.
 * @param {Name} keyName The name of the requested public key.
 * @returns {Blob} The DER Blob.  If not found, return a Blob with a null pointer.
 */
MemoryIdentityStorage.prototype.getKey = function(keyName)
{
  var keyNameUri = keyName.toUri();
  var entry = this.keyStore[keyNameUri];
  if (entry === undefined)
    // Not found.  Silently return a null Blob.
    return new Blob();

  return entry.keyDer;
};

/**
 * Get the KeyType of the public key with the given keyName.
 * @param {Name} keyName The name of the requested public key.
 * @returns {number} The KeyType, for example KEY_TYPE_RSA.
 */
MemoryIdentityStorage.prototype.getKeyType = function(keyName)
{
  var keyNameUri = keyName.toUri();
  var entry = this.keyStore[keyNameUri];
  if (entry === undefined)
    throw new SecurityException(new Error
      ("Cannot get public key type because the keyName doesn't exist"));

  return entry.keyType;
};

/**
 * Activate a key.  If a key is marked as inactive, its private part will not be
 * used in packet signing.
 * @param {Name} keyName name of the key
 */
MemoryIdentityStorage.prototype.activateKey = function(keyName)
{
  throw new Error("MemoryIdentityStorage.activateKey is not implemented");
};

/**
 * Deactivate a key. If a key is marked as inactive, its private part will not
 * be used in packet signing.
 * @param {Name} keyName name of the key
 */
MemoryIdentityStorage.prototype.deactivateKey = function(keyName)
{
  throw new Error("MemoryIdentityStorage.deactivateKey is not implemented");
};

/**
 * Check if the specified certificate already exists.
 * @param {Name} certificateName The name of the certificate.
 * @returns {boolean} true if the certificate exists, otherwise false.
 */
MemoryIdentityStorage.prototype.doesCertificateExist = function(certificateName)
{
  return this.certificateStore[certificateName.toUri()] !== undefined;
};

/**
 * Add a certificate to the identity storage.
 * @param {IdentityCertificate} certificate The certificate to be added.  This
 * makes a copy of the certificate.
 */
MemoryIdentityStorage.prototype.addCertificate = function(certificate)
{
  var certificateName = certificate.getName();
  var keyName = certificate.getPublicKeyName();

  if (!this.doesKeyExist(keyName))
    throw new SecurityException(new Error
      ("No corresponding Key record for certificate! " +
       keyName.toUri() + " " + certificateName.toUri()));

  // Check if the certificate already exists.
  if (this.doesCertificateExist(certificateName))
    throw new SecurityException(new Error
      ("Certificate has already been installed!"));

  // Check if the public key of the certificate is the same as the key record.
  var keyBlob = getKey(keyName);
  if (keyBlob.isNull() ||
      !DataUtils.arraysEqual(keyBlob.buf(),
        certificate.getPublicKeyInfo().getKeyDer().buf()))
    throw new SecurityException(new Error
      ("The certificate does not match the public key!"));

  // Insert the certificate.
  // wireEncode returns the cached encoding if available.
  this.certificateStore[certificateName.toUri()] = certificate.wireEncode();
};

/**
 * Get a certificate from the identity storage.
 * @param {Name} certificateName The name of the requested certificate.
 * @param {boolean} allowAny (optional) If false, only a valid certificate will
 * be returned, otherwise validity is disregarded. If omitted, allowAny is false.
 * @returns {Data} The requested certificate.  If not found, return null.
 */
MemoryIdentityStorage.prototype.getCertificate = function(certificateName, allowAny)
{
  var certificateNameUri = certificateName.toUri();
  if (this.certificateStore[certificateNameUri] === undefined)
    // Not found.  Silently return null.
    return null;

  var data = new Data();
  data.wireDecode(this.certificateStore[certificateNameUri]);
  return data;
};

/*****************************************
 *           Get/Set Default             *
 *****************************************/

/**
 * Get the default identity.
 * @returns {Name} The name of default identity.
 * @throws SecurityException if the default identity is not set.
 */
MemoryIdentityStorage.prototype.getDefaultIdentity = function()
{
  if (this.defaultIdentity.length === 0)
    throw new SecurityException(new Error
      ("MemoryIdentityStorage.getDefaultIdentity: The default identity is not defined"));

  return new Name(this.defaultIdentity);
};

/**
 * Get the default key name for the specified identity.
 * @param {Name} identityName The identity name.
 * @returns {Name} The default key name.
 * @throws SecurityException if the default key name for the identity is not set.
 */
MemoryIdentityStorage.prototype.getDefaultKeyNameForIdentity = function
  (identityName)
{
  throw new Error("MemoryIdentityStorage.getDefaultKeyNameForIdentity is not implemented");
};

/**
 * Get the default certificate name for the specified key.
 * @param {Name} keyName The key name.
 * @returns {Name} The default certificate name.
 * @throws SecurityException if the default certificate name for the key name
 * is not set.
 */
MemoryIdentityStorage.prototype.getDefaultCertificateNameForKey = function(keyName)
{
  throw new Error("MemoryIdentityStorage.getDefaultCertificateNameForKey is not implemented");
};

/**
 * Set the default identity.  If the identityName does not exist, then clear the
 * default identity so that getDefaultIdentity() throws an exception.
 * @param {Name} identityName The default identity name.
 */
MemoryIdentityStorage.prototype.setDefaultIdentity = function(identityName)
{
  var identityUri = identityName.toUri();
  if (this.identityStore[identityUri] !== undefined)
    this.defaultIdentity = identityUri;
  else
    // The identity doesn't exist, so clear the default.
    this.defaultIdentity = "";
};

/**
 * Set the default key name for the specified identity.
 * @param {Name} keyName The key name.
 * @param {Name} identityNameCheck (optional) The identity name to check the
 * keyName.
 */
MemoryIdentityStorage.prototype.setDefaultKeyNameForIdentity = function
  (keyName, identityNameCheck)
{
  throw new Error("MemoryIdentityStorage.setDefaultKeyNameForIdentity is not implemented");
};

/**
 * Set the default key name for the specified identity.
 * @param {Name} keyName The key name.
 * @param {Name} certificateName The certificate name.
 */
MemoryIdentityStorage.prototype.setDefaultCertificateNameForKey = function
  (keyName, certificateName)
{
  throw new Error("MemoryIdentityStorage.setDefaultCertificateNameForKey is not implemented");
};

},{"../../data.js":28,"../../encoding/data-utils.js":33,"../../name.js":55,"../../util/blob.js":77,"../security-exception.js":71,"../security-types.js":72,"./identity-storage.js":61}],63:[function(require,module,exports){
(function (Buffer){
/**
 * Copyright (C) 2014 Regents of the University of California.
 * @author: Jeff Thompson <jefft0@remap.ucla.edu>
 * From ndn-cxx security by Yingdi Yu <yingdi@cs.ucla.edu>.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 * A copy of the GNU General Public License is in the file COPYING.
 */

var Blob = require('../../util/blob.js').Blob;
var SecurityException = require('../security-exception.js').SecurityException;
var PublicKey = require('../certificate/public-key.js').PublicKey;
var KeyClass = require('../security-types.js').KeyClass;
var DigestAlgorithm = require('../security-types.js').DigestAlgorithm;
var DataUtils = require('../../encoding/data-utils.js').DataUtils;
var PrivateKeyStorage = require('./private-key-storage.js').PrivateKeyStorage;

/**
 * MemoryPrivateKeyStorage class extends PrivateKeyStorage to implement private
 * key storage in memory.
 * @constructor
 */
var MemoryPrivateKeyStorage = function MemoryPrivateKeyStorage()
{
  // Call the base constructor.
  PrivateKeyStorage.call(this);

  // The key is the keyName.toUri(). The value is security.certificate.PublicKey.
  this.publicKeyStore = {};
  // The key is the keyName.toUri(). The value is the object
  //  {keyType,     // number from KeyType
  //   privateKey   // The PEM-encoded private key.
  //  }.
  this.privateKeyStore = {};
};

MemoryPrivateKeyStorage.prototype = new PrivateKeyStorage();
MemoryPrivateKeyStorage.prototype.name = "MemoryPrivateKeyStorage";

exports.MemoryPrivateKeyStorage = MemoryPrivateKeyStorage;

/**
 * Set the public key for the keyName.
 * @param {Name} keyName The key name.
 * @param {number} keyType The KeyType, such as KeyType.RSA.
 * @param {Buffer} publicKeyDer The public key DER byte array.
 */
MemoryPrivateKeyStorage.prototype.setPublicKeyForKeyName = function
  (keyName, keyType, publicKeyDer)
{
  this.publicKeyStore[keyName.toUri()] = PublicKey.fromDer(
    keyType, new Blob(publicKeyDer, true));
};

/**
 * Set the private key for the keyName.
 * @param {Name} keyName The key name.
 * @param {number} keyType The KeyType, such as KeyType.RSA.
 * @param {Buffer} privateKeyDer The private key DER byte array.
 */
MemoryPrivateKeyStorage.prototype.setPrivateKeyForKeyName = function
  (keyName, keyType, privateKeyDer)
{
  // Encode the DER as PEM.
  var keyBase64 = privateKeyDer.toString('base64');
  var keyPem = "-----BEGIN RSA PRIVATE KEY-----\n";
  for (var i = 0; i < keyBase64.length; i += 64)
    keyPem += (keyBase64.substr(i, 64) + "\n");
  keyPem += "-----END RSA PRIVATE KEY-----";

  this.privateKeyStore[keyName.toUri()] =
    { keyType: keyType, privateKey: keyPem };
};

/**
 * Set the public and private key for the keyName.
 * @param {Name} keyName The key name.
 * @param {number} keyType The KeyType, such as KeyType.RSA.
 * @param {Buffer} publicKeyDer The public key DER byte array.
 * @param {Buffer} privateKeyDer The private key DER byte array.
 */
MemoryPrivateKeyStorage.prototype.setKeyPairForKeyName = function
  (keyName, keyType, publicKeyDer, privateKeyDer)
{
  this.setPublicKeyForKeyName(keyName, keyType, publicKeyDer);
  this.setPrivateKeyForKeyName(keyName, keyType, privateKeyDer);
};

/**
 * Get the public key
 * @param {Name} keyName The name of public key.
 * @returns {PublicKey} The public key.
 */
MemoryPrivateKeyStorage.prototype.getPublicKey = function(keyName)
{
  var keyNameUri = keyName.toUri();
  var publicKey = this.publicKeyStore[keyNameUri];
  if (publicKey === undefined)
    throw new SecurityException(new Error
      ("MemoryPrivateKeyStorage: Cannot find public key " + keyName.toUri()));

  return publicKey;
};

/**
 * Fetch the private key for keyName and sign the data, returning a signature Blob.
 * @param {Buffer} data Pointer to the input byte array.
 * @param {Name} keyName The name of the signing key.
 * @param {number} digestAlgorithm (optional) The digest algorithm from
 * DigestAlgorithm, such as DigestAlgorithm.SHA256. If omitted, use
 * DigestAlgorithm.SHA256.
 * @returns {Blob} The signature, or a isNull() Blob if signing fails.
 */
MemoryPrivateKeyStorage.prototype.sign = function(data, keyName, digestAlgorithm)
{
  if (digestAlgorithm == null)
    digestAlgorithm = DigestAlgorithm.SHA256;

  if (digestAlgorithm != DigestAlgorithm.SHA256)
    return new Blob();

  // Find the private key.
  var keyUri = keyName.toUri();
  var privateKey = this.privateKeyStore[keyUri];
  if (privateKey === undefined)
    throw new SecurityException(new Error
      ("MemoryPrivateKeyStorage: Cannot find private key " + keyUri));

  var rsa = require("crypto").createSign('RSA-SHA256');
  rsa.update(data);

  var signature = new Buffer
    (DataUtils.toNumbersIfString(rsa.sign(privateKey.privateKey)));
  return new Blob(signature, false);
};

/**
 * Check if a particular key exists.
 * @param {Name} keyName The name of the key.
 * @param {number} keyClass The class of the key, e.g. KeyClass.PUBLIC,
 * KeyClass.PRIVATE, or KeyClass.SYMMETRIC.
 * @returns {boolean} True if the key exists, otherwise false.
 */
MemoryPrivateKeyStorage.prototype.doesKeyExist = function(keyName, keyClass)
{
  var keyUri = keyName.toUri();
  if (keyClass == KeyClass.PUBLIC)
    return this.publicKeyStore[keyUri] !== undefined;
  else if (keyClass == KeyClass.PRIVATE)
    return this.privateKeyStore[keyUri] !== undefined;
  else
    // KeyClass.SYMMETRIC not implemented yet.
    return false ;
};

}).call(this,require("buffer").Buffer)
},{"../../encoding/data-utils.js":33,"../../util/blob.js":77,"../certificate/public-key.js":59,"../security-exception.js":71,"../security-types.js":72,"./private-key-storage.js":64,"buffer":3,"crypto":7}],64:[function(require,module,exports){
/**
 * Copyright (C) 2014 Regents of the University of California.
 * @author: Jeff Thompson <jefft0@remap.ucla.edu>
 * From ndn-cxx security by Yingdi Yu <yingdi@cs.ucla.edu>.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 * A copy of the GNU General Public License is in the file COPYING.
 */

/**
 * PrivateKeyStorage is an abstract class which declares methods for working
 * with a private key storage. You should use a subclass.
 * @constructor
 */
var PrivateKeyStorage = function PrivateKeyStorage()
{
};

exports.PrivateKeyStorage = PrivateKeyStorage;

/**
 * Generate a pair of asymmetric keys.
 * @param {Name} keyName The name of the key pair.
 * @param {number} keyType (optional) The type of the key pair, e.g. KeyType.RSA.
 * If omitted, use KeyType.RSA.
 * @param {number} keySize (optional) The size of the key pair. If omitted, use
 * 2048.
 */
PrivateKeyStorage.prototype.generateKeyPair = function(keyName, keyType, keySize)
{
  throw new Error("PrivateKeyStorage.generateKeyPair is not implemented");
};

/**
 * Get the public key
 * @param {Name} keyName The name of public key.
 * @returns {PublicKey} The public key.
 */
PrivateKeyStorage.prototype.getPublicKey = function(keyName)
{
  throw new Error("PrivateKeyStorage.getPublicKey is not implemented");
};

/**
 * Fetch the private key for keyName and sign the data, returning a signature Blob.
 * @param {Buffer} data Pointer to the input byte array.
 * @param {Name} keyName The name of the signing key.
 * @param {number} digestAlgorithm (optional) The digest algorithm from
 * DigestAlgorithm, such as DigestAlgorithm.SHA256. If omitted, use
 * DigestAlgorithm.SHA256.
 * @returns {Blob} The signature, or a isNull() Blob if signing fails.
 */
PrivateKeyStorage.prototype.sign = function(data, keyName, digestAlgorithm)
{
  throw new Error("PrivateKeyStorage.sign is not implemented");
};

/**
 * Decrypt data.
 * @param {Name} keyName The name of the decrypting key.
 * @param {Buffer} data The byte to be decrypted.
 * @param {boolean} isSymmetric (optional) If true symmetric encryption is used,
 * otherwise asymmetric encryption is used. If omitted, use asymmetric
 * encryption.
 * @returns {Blob} The decrypted data.
 */
PrivateKeyStorage.prototype.decrypt = function(keyName, data, isSymmetric)
{
  throw new Error("PrivateKeyStorage.decrypt is not implemented");
};

/**
 * Encrypt data.
 * @param {Name} keyName The name of the encrypting key.
 * @param {Buffer} data The byte to be encrypted.
 * @param {boolean} isSymmetric (optional) If true symmetric encryption is used,
 * otherwise asymmetric encryption is used. If omitted, use asymmetric
 * encryption.
 * @returns {Blob} The encrypted data.
 */
PrivateKeyStorage.prototype.encrypt = function(keyName, data, isSymmetric)
{
  throw new Error("PrivateKeyStorage.encrypt is not implemented");
};

/**
 * @brief Generate a symmetric key.
 * @param {Name} keyName The name of the key.
 * @param {number} keyType (optional) The type of the key from KeyType, e.g.
 * KeyType.AES. If omitted, use KeyType.AES.
 * @param {number} keySize (optional) The size of the key. If omitted, use 256.
 */
PrivateKeyStorage.prototype.generateKey = function(keyName, keyType, keySize)
{
  throw new Error("PrivateKeyStorage.generateKey is not implemented");
};

/**
 * Check if a particular key exists.
 * @param {Name} keyName The name of the key.
 * @param {number} keyClass The class of the key, e.g. KeyClass.PUBLIC,
 * KeyClass.PRIVATE, or KeyClass.SYMMETRIC.
 * @returns {boolean} True if the key exists, otherwise false.
 */
PrivateKeyStorage.prototype.doesKeyExist = function(keyName, keyClass)
{
  throw new Error("PrivateKeyStorage.doesKeyExist is not implemented");
};

},{}],65:[function(require,module,exports){
/**
 * Copyright (C) 2014 Regents of the University of California.
 * @author: Jeff Thompson <jefft0@remap.ucla.edu>
 * From ndn-cxx security by Yingdi Yu <yingdi@cs.ucla.edu>.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 * A copy of the GNU General Public License is in the file COPYING.
 */

var Name = require('../name.js').Name;
var Interest = require('../interest.js').Interest;
var Data = require('../data.js').Data;
var KeyLocatorType = require('../key-locator.js').KeyLocatorType;
var WireFormat = require('../encoding/wire-format.js').WireFormat;
var Tlv = require('../encoding/tlv/tlv.js').Tlv;
var TlvEncoder = require('../encoding/tlv/tlv-encoder.js').TlvEncoder;
var SecurityException = require('./security-exception.js').SecurityException;

/**
 * A KeyChain provides a set of interfaces to the security library such as
 * identity management, policy configuration and packet signing and verification.
 * Note: This class is an experimental feature. See the API docs for more detail at
 * http://named-data.net/doc/ndn-ccl-api/key-chain.html .
 *
 * Create a new KeyChain with the given IdentityManager and PolicyManager.
 * @param {IdentityManager} identityManager An object of a subclass of
 * IdentityManager.
 * @param {PolicyManager} policyManager An object of a subclass of
 * PolicyManager.
 * @constructor
 */
var KeyChain = function KeyChain(identityManager, policyManager)
{
  this.identityManager = identityManager;
  this.policyManager = policyManager;
  this.encryptionManager = null;
  this.face = null;
  this.maxSteps = 100;
};

exports.KeyChain = KeyChain;

/*****************************************
 *          Identity Management          *
 *****************************************/

/**
 * Create an identity by creating a pair of Key-Signing-Key (KSK) for this
 * identity and a self-signed certificate of the KSK.
 * @param {Name} identityName The name of the identity.
 * @returns {Name} The key name of the auto-generated KSK of the identity.
 */
KeyChain.prototype.createIdentity = function(identityName)
{
  return this.identityManager.createIdentity(identityName);
};

/**
 * Get the default identity.
 * @returns {Name} The name of default identity.
 * @throws SecurityException if the default identity is not set.
 */
KeyChain.prototype.getDefaultIdentity = function()
{
  return this.identityManager.getDefaultIdentity();
};

/**
 * Get the default certificate name of the default identity.
 * @returns {Name} The requested certificate name.
 * @throws SecurityException if the default identity is not set or the default
 * key name for the identity is not set or the default certificate name for
 * the key name is not set.
 */
KeyChain.prototype.getDefaultCertificateName = function()
{
  return this.identityManager.getDefaultCertificateName();
};

/**
 * Generate a pair of RSA keys for the specified identity.
 * @param {Name} identityName The name of the identity.
 * @param {boolean} isKsk (optional) true for generating a Key-Signing-Key (KSK),
 * false for a Data-Signing-Key (DSK). If omitted, generate a Data-Signing-Key.
 * @param {number} keySize (optional) The size of the key. If omitted, use a
 * default secure key size.
 * @returns {Name} The generated key name.
 */
KeyChain.prototype.generateRSAKeyPair = function(identityName, isKsk, keySize)
{
  return this.identityManager.generateRSAKeyPair(identityName, isKsk, keySize);
};

/**
 * Set a key as the default key of an identity.
 * @param {Name} keyName The name of the key.
 * @param {Name} identityName (optional) the name of the identity. If not
 * specified, the identity name is inferred from the keyName.
 */
KeyChain.prototype.setDefaultKeyForIdentity = function(keyName, identityName)
{
  if (identityName == null)
    identityName = new Name();
  return this.identityManager.setDefaultKeyForIdentity(keyName, identityName);
};

/**
 * Generate a pair of RSA keys for the specified identity and set it as default
 * key for the identity.
 * @param {Name} identityName The name of the identity.
 * @param {boolean} isKsk (optional) true for generating a Key-Signing-Key (KSK),
 * false for a Data-Signing-Key (DSK). If omitted, generate a Data-Signing-Key.
 * @param {number} keySize (optional) The size of the key. If omitted, use a
 * default secure key size.
 * @returns {Name} The generated key name.
 */
KeyChain.prototype.generateRSAKeyPairAsDefault = function
  (identityName, isKsk, keySize)
{
  return this.identityManager.generateRSAKeyPairAsDefault
    (identityName, isKsk, keySize);
};

/**
 * Create a public key signing request.
 * @param {Name} keyName The name of the key.
 * @returns {Blob} The signing request data.
 */
KeyChain.prototype.createSigningRequest = function(keyName)
{
  return this.identityManager.getPublicKey(keyName).getKeyDer();
};

/**
 * Install an identity certificate into the public key identity storage.
 * @param {IdentityCertificate} certificate The certificate to to added.
 */
KeyChain.prototype.installIdentityCertificate = function(certificate)
{
  this.identityManager.addCertificate(certificate);
};

/**
 * Set the certificate as the default for its corresponding key.
 * @param {IdentityCertificate} certificate The certificate.
 */
KeyChain.prototype.setDefaultCertificateForKey = function(certificate)
{
  this.identityManager.setDefaultCertificateForKey(certificate);
};

/**
 * Get a certificate with the specified name.
 * @param {Name} certificateName The name of the requested certificate.
 * @returns {Certificate} The requested certificate which is valid.
 */
KeyChain.prototype.getCertificate = function(certificateName)
{
  return this.identityManager.getCertificate(certificateName);
};

/**
 * Get a certificate even if the certificate is not valid anymore.
 * @param {Name} certificateName The name of the requested certificate.
 * @returns {Certificate} The requested certificate.
 */
KeyChain.prototype.getAnyCertificate = function(certificateName)
{
  return this.identityManager.getAnyCertificate(certificateName);
};

/**
 * Get an identity certificate with the specified name.
 * @param {Name} certificateName The name of the requested certificate.
 * @returns {IdentityCertificate} The requested certificate which is valid.
 */
KeyChain.prototype.getIdentityCertificate = function(certificateName)
{
  return this.identityManager.getCertificate(certificateName);
};

/**
 * Get an identity certificate even if the certificate is not valid anymore.
 * @param {Name} certificateName The name of the requested certificate.
 * @returns {IdentityCertificate} The requested certificate.
 */
KeyChain.prototype.getAnyIdentityCertificate = function(certificateName)
{
  return this.identityManager.getAnyCertificate(certificateName);
};

/**
 * Revoke a key.
 * @param {Name} keyName The name of the key that will be revoked.
 */
KeyChain.prototype.revokeKey = function(keyName)
{
  //TODO: Implement
};

/**
 * Revoke a certificate.
 * @param {Name} certificateName The name of the certificate that will be
 * revoked.
 */
KeyChain.prototype.revokeCertificate = function(certificateName)
{
  //TODO: Implement
};

/**
 * Get the identity manager given to or created by the constructor.
 * @returns {IdentityManager} The identity manager.
 */
KeyChain.prototype.getIdentityManager = function()
{ 
  return this.identityManager;
};

/*****************************************
 *           Policy Management           *
 *****************************************/

/**
 * Get the policy manager given to or created by the constructor.
 * @returns {PolicyManager} The policy manager.
 */
KeyChain.prototype.getPolicyManager = function()
{ 
  return this.policyManager;
};

/*****************************************
 *              Sign/Verify              *
 *****************************************/

/**
 * Sign the target. If it is a Data or Interest object, set its signature. If it
 * is an array, return a signature object.
 * @param {Data|Interest|Buffer} target If this is a Data object, wire encode for
 * signing, update its signature and key locator field and wireEncoding. If this
 * is an Interest object, wire encode for signing, append a SignatureInfo to the
 * Interest name, sign the name components and append a final name component
 * with the signature bits. If it is an array, sign it and return a Signature
 * object.
 * @param {Name} certificateName The certificate name of the key to use for
 * signing.
 * @param {WireFormat} wireFormat (optional) A WireFormat object used to encode
 * the input. If omitted, use WireFormat getDefaultWireFormat().
 */
KeyChain.prototype.sign = function(target, certificateName, wireFormat)
{
  if (target instanceof Interest)
    this.signInterest(target, certificateName, wireFormat);
  else if (target instanceof Data)
    this.identityManager.signByCertificate(target, certificateName, wireFormat);
  else
    return this.identityManager.signByCertificate(target, certificateName);
};

/**
 * Append a SignatureInfo to the Interest name, sign the name components and
 * append a final name component with the signature bits.
 * @param {Interest} interest The Interest object to be signed. This appends
 * name components of SignatureInfo and the signature bits.
 * @param {Name} certificateName The certificate name of the key to use for
 * signing.
 * @param {WireFormat} wireFormat (optional) A WireFormat object used to encode
 * the input. If omitted, use WireFormat getDefaultWireFormat().
 */
KeyChain.prototype.signInterest = function(interest, certificateName, wireFormat)
{
  wireFormat = (wireFormat || WireFormat.getDefaultWireFormat());

  // TODO: Handle signature algorithms other than Sha256WithRsa.
  var signature = Sha256WithRsaSignature();
  signature.getKeyLocator().setType(KeyLocatorType.KEYNAME);
  signature.getKeyLocator().setKeyName(certificateName.getPrefix(-1));

  // Append the encoded SignatureInfo.
  interest.getName().append(wireFormat.encodeSignatureInfo(signature));

  // Append an empty signature so that the "signedPortion" is correct.
  interest.getName().append(new Name.Component());
  // Encode once to get the signed portion.
  var encoding = interest.wireEncode(wireFormat);
  var signedSignature = this.sign(encoding.toSignedBuffer(), certificateName);

  // Remove the empty signature and append the real one.
  var encoder = new TlvEncoder(256);
  encoder.writeBlobTlv
    (Tlv.SignatureValue, signedSignature.getSignature().buf());
  interest.setName(interest.getName().getPrefix(-1).append
    (wireFormat.encodeSignatureValue(signedSignature)));
};

/**
 * Sign the target. If it is a Data object, set its signature. If it is an
 * array, return a signature object.
 * @param {Data|Buffer} target If this is a Data object, wire encode for
 * signing, update its signature and key locator field and wireEncoding. If it
 * is an array, sign it and return a Signature object.
 * @param identityName (optional) The identity name for the key to use for
 * signing.  If omitted, infer the signing identity from the data packet name.
 * @param wireFormat (optional) A WireFormat object used to encode the input. If
 * omitted, use WireFormat getDefaultWireFormat().
 */
KeyChain.prototype.signByIdentity = function(target, identityName, wireFormat)
{
  if (identityName == null)
    identityName = new Name();

  if (target instanceof Data) {
    var signingCertificateName;
    if (identityName.size() == 0) {
      var inferredIdentity = this.policyManager.inferSigningIdentity
        (data.getName());
      if (inferredIdentity.size() == 0)
        signingCertificateName = this.identityManager.getDefaultCertificateName();
      else
        signingCertificateName =
          this.identityManager.getDefaultCertificateNameForIdentity
            (inferredIdentity);
    }
    else
      signingCertificateName =
        this.identityManager.getDefaultCertificateNameForIdentity(identityName);

    if (signingCertificateName.size() == 0)
      throw new SecurityException(new Error
        ("No qualified certificate name found!"));

    if (!this.policyManager.checkSigningPolicy
         (data.getName(), signingCertificateName))
      throw new SecurityException(new Error
        ("Signing Cert name does not comply with signing policy"));

    this.identityManager.signByCertificate
      (data, signingCertificateName, wireFormat);
  }
  else {
    var signingCertificateName =
      this.identityManager.getDefaultCertificateNameForIdentity(identityName);

    if (signingCertificateName.size() == 0)
      throw new SecurityException(new Error
        ("No qualified certificate name found!"));

    return this.identityManager.signByCertificate(array, signingCertificateName);
  }
};

/**
 * Check the signature on the Data object and call either onVerify or 
 * onVerifyFailed. We use callback functions because verify may fetch
 * information to check the signature.
 * @param {Data} data The Data object with the signature to check.
 * @param {function} onVerified If the signature is verified, this calls
 * onVerified(data).
 * @param {function} onVerifyFailed If the signature check fails, this calls
 * onVerifyFailed(data).
 * @param {number} stepCount
 */
KeyChain.prototype.verifyData = function
  (data, onVerified, onVerifyFailed, stepCount)
{
  if (this.policyManager.requireVerify(data)) {
    var nextStep = this.policyManager.checkVerificationPolicy
      (data, stepCount, onVerified, onVerifyFailed);
    if (nextStep != null) {
      var thisKeyChain = this;
      this.face.expressInterest
        (nextStep.interest,
         function(callbackInterest, callbackData) {
           thisKeyChain.onCertificateData(callbackInterest, callbackData, nextStep);
         },
         function(callbackInterest) {
           thisKeyChain.onCertificateInterestTimeout
             (callbackInterest, nextStep.retry, onVerifyFailed, data, nextStep);
         });
    }
  }
  else if (this.policyManager.skipVerifyAndTrust(data))
    onVerified(data);
  else
    onVerifyFailed(data);
};

/**
 * Check the signature on the signed interest and call either onVerify or
 * onVerifyFailed. We use callback functions because verify may fetch
 * information to check the signature.
 * @param {Interest} interest The interest with the signature to check.
 * @param {function} onVerified If the signature is verified, this calls
 * onVerified(data).
 * @param {function} onVerifyFailed If the signature check fails, this calls
 * onVerifyFailed(data).
 */
KeyChain.prototype.verifyInterest = function
  (interest, onVerified, onVerifyFailed, stepCount, wireFormat)
{
  throw new Error("KeyChain.verifyInterest is not implemented");
};

/*****************************************
 *           Encrypt/Decrypt             *
 *****************************************/

/**
 * Generate a symmetric key.
 * @param {Name} keyName The name of the generated key.
 * @param {number} keyType (optional) The type of the key from KeyType, e.g.
 * KeyType.AES.
 */
KeyChain.prototype.generateSymmetricKey = function(keyName, keyType)
{
  this.encryptionManager.createSymmetricKey(keyName, keyType);
};

/**
 * Encrypt a byte array.
 * @param {Name} keyName The name of the encrypting key.
 * @param {Buffer} data The byte array that will be encrypted.
 * @param {boolean} useSymmetric (optional) If true then symmetric encryption is
 * used, otherwise asymmetric encryption is used. If omitted, use symmetric
 * encryption.
 * @param encryptMode (optional) The encryption mode from EncryptMode. If
 * omitted, use EncryptMode.DEFAULT.
 * @returns {Blob} The encrypted data as an immutable Blob.
 */
KeyChain.prototype.encrypt = function(keyName, data, useSymmetric, encryptMode)
{
  return this.encryptionManager.encrypt(keyName, data, useSymmetric, encryptMode);
}

/**
 * Decrypt a byte array.
 * @param {Name} keyName The name of the decrypting key.
 * @param {Buffer} data The byte array that will be decrypted.
 * @param {boolean} useSymmetric (optional) If true then symmetric encryption is
 * used, otherwise asymmetric encryption is used. If omitted, use symmetric
 * encryption.
 * @param encryptMode (optional) The encryption mode from EncryptMode. If
 * omitted, use EncryptMode.DEFAULT.
 * @returns {Blob} The decrypted data as an immutable Blob.
 */
KeyChain.prototype.decrypt = function(keyName, data, useSymmetric, encryptMode)
{
   return this.encryptionManager.decrypt
     (keyName, data, useSymmetric, encryptMode);
};

/**
 * Set the Face which will be used to fetch required certificates.
 * @param {Face} face A pointer to the Face object.
 */
KeyChain.prototype.setFace = function(face)
{ 
  this.face = face;
};

KeyChain.prototype.onCertificateData = function(interest, data, nextStep)
{
  // Try to verify the certificate (data) according to the parameters in nextStep.
  this.verifyData
    (data, nextStep.onVerified, nextStep.onVerifyFailed, nextStep.stepCount);
};

KeyChain.prototype.onCertificateInterestTimeout = function
  (interest, retry, onVerifyFailed, data, nextStep)
{
  if (retry > 0) {
    // Issue the same expressInterest as in verifyData except decrement retry.
    var thisKeyChain = this;
    this.face.expressInterest
      (interest,
       function(callbackInterest, callbackData) {
         thisKeyChain.onCertificateData(callbackInterest, callbackData, nextStep);
       },
       function(callbackInterest) {
         thisKeyChain.onCertificateInterestTimeout
           (callbackInterest, retry - 1, onVerifyFailed, data, nextStep);
       });
  }
  else
    onVerifyFailed(data);
};

},{"../data.js":28,"../encoding/tlv/tlv-encoder.js":41,"../encoding/tlv/tlv.js":43,"../encoding/wire-format.js":44,"../interest.js":50,"../key-locator.js":51,"../name.js":55,"./security-exception.js":71}],66:[function(require,module,exports){
/**
 * Copyright (C) 2013-2014 Regents of the University of California.
 * @author: Meki Cheraoui
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 * A copy of the GNU General Public License is in the file COPYING.
 */

var Key = require('../key.js').Key;

/**
 * @constructor
 */
var KeyManager = function KeyManager()
{
  // Public Key
    this.publicKey =
  "-----BEGIN PUBLIC KEY-----\n" +
  "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAuAmnWYKE7E8G+hyy4TiT\n"	+
  "U7t91KyIGvglEeT6HWEkW4LKzXLO22a1jVS9+yP96I6vp7N5vpS1t7oXtgWuzkO+\n" +
  "O85u6gfbvwp+67zJe2I89eHO4dmNnP4fx/j7WcCUCyzZfbyW67h5IoouoBIdQge2\n" +
  "Xdvh9rFdex9UUhyjEZv5676zlcqlhz8xGBrJmQHsqpD9ijY1XhKBvoSIoQ0ZKkpm\n" +
  "wVk8QYM9PbjUqzSQBj4aYXS+BPV6aRudVvyDt2DBXp2FNP0CGrosCXKnSl4Yv8BY\n" +
  "p0k0RmFZDuJuntLb/XIvPEfMX5li7g3zHzAlIJIVSwT+FRkd3H5cECFSIZFUYIuS\n" +
  "QQIDAQAB\n" +
  "-----END PUBLIC KEY-----";
  // Private Key
    this.privateKey =
  "-----BEGIN RSA PRIVATE KEY-----\n" +
  "MIIEpQIBAAKCAQEAuAmnWYKE7E8G+hyy4TiTU7t91KyIGvglEeT6HWEkW4LKzXLO\n"	+
  "22a1jVS9+yP96I6vp7N5vpS1t7oXtgWuzkO+O85u6gfbvwp+67zJe2I89eHO4dmN\n" +
  "nP4fx/j7WcCUCyzZfbyW67h5IoouoBIdQge2Xdvh9rFdex9UUhyjEZv5676zlcql\n" +
  "hz8xGBrJmQHsqpD9ijY1XhKBvoSIoQ0ZKkpmwVk8QYM9PbjUqzSQBj4aYXS+BPV6\n" +
  "aRudVvyDt2DBXp2FNP0CGrosCXKnSl4Yv8BYp0k0RmFZDuJuntLb/XIvPEfMX5li\n" +
  "7g3zHzAlIJIVSwT+FRkd3H5cECFSIZFUYIuSQQIDAQABAoIBAQCKBftzfxavn6lM\n" +
  "5T8m+GZN0vzRBsBg8Z/jpsYKSLOayiHNKYCIPaSFpXuCIYEo6/JDJLB2xVLvwupL\n" +
  "gkGSwm2mrvCyJkihI38Cz6iQF6I+iia9bYrupgwxzsK7klm1c+J9kXXivYxj4hyL\n" +
  "wmoc/mnARMtYV7cTQvDbUEzgRQmPykWKBv6Y0SL1WprfiRfKIMwSqQk91ffj6whK\n" +
  "xBLAuUdseVBmo/ivLPq0a+wDrcvaJAxSB4eIwCHzAugkRA/NoK0vG3mra0lK5jvQ\n" +
  "rcNIuffxNAnresDVDTnYRc42etjePLAhlpeK/4sjYE/wPdeP8yzLHUg/hsSpAPIj\n" +
  "LXJNZqUBAoGBANxPmUQNf1lGHo/nLY3dVMD3+kYNnTUD8XwS81qdg8/dNyF8t+7D\n" +
  "OdJ1j7Itb+zGA1XXAGfTm6JoUG+eKKR2OSuyZcxygpOgzxAFanXKhTWZsKbG70xN\n" +
  "mX0sOAEhtTGsgFTEGEv977MwIlFa6n2bsp3Luj/AGmvNsOYvBDPXOklxAoGBANXZ\n" +
  "yXAaE7M5JALusLuEFxLGvWVz6TRdQ//c+FWvKrnh+nFlTlAPpDvlaPJJca8ViNev\n" +
  "xJ2UhGtbENXAqgwTYpnAi/yQD4dATViIveK6Pn4t12mpPAlkMbbMTR8jtp5l1oHc\n" +
  "hcwe8QuEOKuTX5+STpNGlWs+tsMb12mhCpc3eO3RAoGAMxjDE2WOA8afkACuMBkF\n" +
  "bzwUb+r4azNe7sf2aS3fRHaqMroabuYYoxdhHJItQ10pqN8U2P/bOO+4uCqWgo5o\n" +
  "9BmMQr7MSjEh1TVsW6V8/9GFhyjcl3XoA4Ad/SU0QTEhEofomrdqwMSJMRVFDZzu\n" +
  "8Gov6FlFx3sNbFW7Q8rHWgECgYEAq/TVz3iIgsLdvCXmosHSM9zvCpcr3FlqhmFO\n" +
  "pseVmaamVWxajnIlY6xSuRBpg5nTUWwas4Nq/1BYtyiXE+K6lFuJtOq6Mc145EoA\n" +
  "NkIAYkHGR0Y36m1QtGaPVQzImZHV7NJAHCR9Ov90+jIk4BErca1+FKB3IWhPzLYb\n" +
  "6ABJEyECgYEAthhzWSxPkqyiLl+2vnhdR3EEkvDX6MV6hGu4tDAf2A1Y0GSApyEa\n" +
  "SAA31hlxu5EgneLD7Ns2HMpIfQMydB5lcwKQc9g/tVI1eRzuk6Myi+2JmPEM2BLy\n" +
  "iX8yI+xnZlKDiZleQitCS4RQGz5HbXT70aYQIGxuvkQ/uf68jdrL6o8=\n" +
  "-----END RSA PRIVATE KEY-----";

  this.key = null;
};

/**
 * Return a Key object for the keys in this KeyManager.  This creates the Key on the first
 * call and returns a cached copy after that.
 * @returns {Key}
 */
KeyManager.prototype.getKey = function()
{
  if (this.key === null) {
    this.key = new Key();
    this.key.fromPemString(this.publicKey, this.privateKey);
  }

  return this.key;
}

var globalKeyManager = globalKeyManager || new KeyManager();
exports.globalKeyManager = globalKeyManager;

},{"../key.js":52}],67:[function(require,module,exports){
/**
 * Copyright (C) 2014 Regents of the University of California.
 * @author: Jeff Thompson <jefft0@remap.ucla.edu>
 * From ndn-cxx security by Yingdi Yu <yingdi@cs.ucla.edu>.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 * A copy of the GNU General Public License is in the file COPYING.
 */

var Name = require('../../name.js').Name;
var PolicyManager = require('./policy-manager.js').PolicyManager;

/**
 * @constructor
 */
var NoVerifyPolicyManager = function NoVerifyPolicyManager()
{
  // Call the base constructor.
  PolicyManager.call(this);
};

NoVerifyPolicyManager.prototype = new PolicyManager();
NoVerifyPolicyManager.prototype.name = "NoVerifyPolicyManager";

exports.NoVerifyPolicyManager = NoVerifyPolicyManager;

/**
 * Override to always skip verification and trust as valid.
 *
 * @param {Data|Interest} dataOrInterest The received data packet or interest.
 * @returns {boolean} True.
 */
NoVerifyPolicyManager.prototype.skipVerifyAndTrust = function(dataOrInterest)
{
  return true;
};

/**
 * Override to return false for no verification rule for the received data or
 * signed interest.
 *
 * @param {Data|Interest} dataOrInterest The received data packet or interest.
 * @returns {boolean} False.
 */
NoVerifyPolicyManager.prototype.requireVerify = function(dataOrInterest)
{
  return false;
};

/**
 * Override to call onVerified(data) and to indicate no further verification
 * step.
 *
 * @param {Data|Interest} dataOrInterest The Data object or interest with the
 * signature to check.
 * @param {number} stepCount The number of verification steps that have been
 * done, used to track the verification progress.
 * @param {function} onVerified This does override to call
 * onVerified(dataOrInterest).
 * @param {function} onVerifyFailed Override to ignore this.
 * @param {WireFormat} wireFormat
 * @returns {ValidationRequest} null for no further step for looking up a
 * certificate chain.
 */
NoVerifyPolicyManager.prototype.checkVerificationPolicy = function
  (dataOrInterest, stepCount, onVerified, onVerifyFailed, wireFormat)
{
  onVerified(dataOrInterest);
  return null;
};

/**
 * Override to always indicate that the signing certificate name and data name
 * satisfy the signing policy.
 *
 * @param {Name} dataName The name of data to be signed.
 * @param {Name} certificateName The name of signing certificate.
 * @returns {boolean} True to indicate that the signing certificate can be used
 * to sign the data.
 */
NoVerifyPolicyManager.prototype.checkSigningPolicy = function
  (dataName, certificateName)
{
  return true;
};

/**
 * Override to indicate that the signing identity cannot be inferred.
 *
 * @param {Name} dataName The name of data to be signed.
 * @returns {Name} An empty name because cannot infer.
 */
NoVerifyPolicyManager.prototype.inferSigningIdentity = function(dataName)
{
  return new Name();
};

},{"../../name.js":55,"./policy-manager.js":68}],68:[function(require,module,exports){
/**
 * Copyright (C) 2014 Regents of the University of California.
 * @author: Jeff Thompson <jefft0@remap.ucla.edu>
 * From ndn-cxx security by Yingdi Yu <yingdi@cs.ucla.edu>.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 * A copy of the GNU General Public License is in the file COPYING.
 */

/**
 * A PolicyManager is an abstract base class to represent the policy for
 * verifying data packets. You must create an object of a subclass.
 * @constructor
 */
var PolicyManager = function PolicyManager()
{
};

exports.PolicyManager = PolicyManager;

/**
 * Check if the received data packet or signed interest can escape from
 * verification and be trusted as valid.
 * Your derived class should override.
 *
 * @param {Data|Interest} dataOrInterest The received data packet or interest.
 * @returns {boolean} True if the data or interest does not need to be verified
 * to be trusted as valid, otherwise false.
 */
PolicyManager.prototype.skipVerifyAndTrust = function(dataOrInterest)
{
  throw new Error("PolicyManager.skipVerifyAndTrust is not implemented");
};

/**
 * Check if this PolicyManager has a verification rule for the received data
 * packet or signed interest.
 * Your derived class should override.
 *
 * @param {Data|Interest} dataOrInterest The received data packet or interest.
 * @returns {boolean} True if the data or interest must be verified, otherwise
 * false.
 */
PolicyManager.prototype.requireVerify = function(dataOrInterest)
{
  throw new Error("PolicyManager.requireVerify is not implemented");
};

/**
 * Check whether the received data packet complies with the verification policy,
 * and get the indication of the next verification step.
 * Your derived class should override.
 *
 * @param {Data|Interest} dataOrInterest The Data object or interest with the
 * signature to check.
 * @param {number} stepCount The number of verification steps that have been
 * done, used to track the verification progress.
 * @param {function} onVerified If the signature is verified, this calls
 * onVerified(data).
 * @param {function} onVerifyFailed If the signature check fails, this calls
 * onVerifyFailed(data).
 * @param {WireFormat} wireFormat
 * @returns {ValidationRequest} The indication of next verification step, or
 * null if there is no further step.
 */
PolicyManager.prototype.checkVerificationPolicy = function
  (dataOrInterest, stepCount, onVerified, onVerifyFailed, wireFormat)
{
  throw new Error("PolicyManager.checkVerificationPolicy is not implemented");
};

/**
 * Check if the signing certificate name and data name satisfy the signing
 * policy.
 * Your derived class should override.
 *
 * @param {Name} dataName The name of data to be signed.
 * @param {Name} certificateName The name of signing certificate.
 * @returns {boolean} True if the signing certificate can be used to sign the
 * data, otherwise false.
 */
PolicyManager.prototype.checkSigningPolicy = function(dataName, certificateName)
{
  throw new Error("PolicyManager.checkSigningPolicy is not implemented");
};

/**
 * Infer the signing identity name according to the policy. If the signing
 * identity cannot be inferred, return an empty name.
 * Your derived class should override.
 *
 * @param {Name} dataName The name of data to be signed.
 * @returns {Name} The signing identity or an empty name if cannot infer.
 */
PolicyManager.prototype.inferSigningIdentity = function(dataName)
{
  throw new Error("PolicyManager.inferSigningIdentity is not implemented");
};

},{}],69:[function(require,module,exports){
/**
 * Copyright (C) 2014 Regents of the University of California.
 * @author: Jeff Thompson <jefft0@remap.ucla.edu>
 * From ndn-cxx security by Yingdi Yu <yingdi@cs.ucla.edu>.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 * A copy of the GNU General Public License is in the file COPYING.
 */

var Name = require('../../name.js').Name;
var Data = require('../../data.js').Data;
var DataUtils = require('../../encoding/data-utils.js').DataUtils;
var IdentityCertificate = require('../certificate/identity-certificate.js').IdentityCertificate;
var KeyLocatorType = require('../../key-locator.js').KeyLocatorType;
var SecurityException = require('../security-exception.js').SecurityException;
var WireFormat = require('../../encoding/wire-format.js').WireFormat;
var PolicyManager = require('./policy-manager.js').PolicyManager;

/**
 * A SelfVerifyPolicyManager implements a PolicyManager to use the public key
 * DER in the data packet's KeyLocator (if available) or look in the
 * IdentityStorage for the public key with the name in the KeyLocator (if
 * available) and use it to verify the data packet, without searching a
 * certificate chain.  If the public key can't be found, the verification fails.
 *
 * @param {IdentityStorage} identityStorage (optional) The IdentityStorage for
 * looking up the public key. This object must remain valid during the life of
 * this SelfVerifyPolicyManager. If omitted, then don't look for a public key
 * with the name in the KeyLocator and rely on the KeyLocator having the full
 * public key DER.
 * @constructor
 */
var SelfVerifyPolicyManager = function SelfVerifyPolicyManager(identityStorage)
{
  // Call the base constructor.
  PolicyManager.call(this);

  this.identityStorage = identityStorage;
};

SelfVerifyPolicyManager.prototype = new PolicyManager();
SelfVerifyPolicyManager.prototype.name = "SelfVerifyPolicyManager";

exports.SelfVerifyPolicyManager = SelfVerifyPolicyManager;

/**
 * Never skip verification.
 *
 * @param {Data|Interest} dataOrInterest The received data packet or interest.
 * @returns {boolean} False.
 */
SelfVerifyPolicyManager.prototype.skipVerifyAndTrust = function(dataOrInterest)
{
  return false;
};

/**
 * Always return true to use the self-verification rule for the received data.
 *
 * @param {Data|Interest} dataOrInterest The received data packet or interest.
 * @returns {boolean} True.
 */
SelfVerifyPolicyManager.prototype.requireVerify = function(dataOrInterest)
{
  return true;
};

/**
 * Use the public key DER in the KeyLocator (if available) or look in the
 * IdentityStorage for the public key with the name in the KeyLocator (if
 * available) and use it to verify the data packet.  If the public key can't
   * be found, call onVerifyFailed.
 *
 * @param {Data|Interest} dataOrInterest The Data object or interest with the
 * signature to check.
 * @param {number} stepCount The number of verification steps that have been
 * done, used to track the verification progress.
 * @param {function} onVerified If the signature is verified, this calls
 * onVerified(data).
 * @param {function} onVerifyFailed If the signature check fails, this calls
 * onVerifyFailed(data).
 * @param {WireFormat} wireFormat
 * @returns {ValidationRequest} null for no further step for looking up a
 * certificate chain.
 */
SelfVerifyPolicyManager.prototype.checkVerificationPolicy = function
  (dataOrInterest, stepCount, onVerified, onVerifyFailed, wireFormat)
{
  wireFormat = (wireFormat || WireFormat.getDefaultWireFormat());

  if (dataOrInterest instanceof Data) {
    var data = dataOrInterest;
    // wireEncode returns the cached encoding if available.
    if (this.verify(data.getSignature(), data.wireEncode()))
      onVerified(data);
    else
      onVerifyFailed(data);
  }
  else if (dataOrInterest instanceof Interest) {
    var interest = dataOrInterest;
    // Decode the last two name components of the signed interest
    var signature = wireFormat.decodeSignatureInfoAndValue
      (interest.getName().get(-2).getValue().buf(),
       interest.getName().get(-1).getValue().buf());

    // wireEncode returns the cached encoding if available.
    if (this.verify(signature, interest.wireEncode()))
      onVerified(interest);
    else
      onVerifyFailed(interest);
  }
  else
    throw new SecurityException(new Error
      ("checkVerificationPolicy: unrecognized type for dataOrInterest"));

  // No more steps, so return a None.
  return null;
};

/**
 * Override to always indicate that the signing certificate name and data name
 * satisfy the signing policy.
 *
 * @param {Name} dataName The name of data to be signed.
 * @param {Name} certificateName The name of signing certificate.
 * @returns {boolean} True to indicate that the signing certificate can be used
 * to sign the data.
 */
SelfVerifyPolicyManager.prototype.checkSigningPolicy = function
  (dataName, certificateName)
{
  return true;
};

/**
 * Override to indicate that the signing identity cannot be inferred.
 *
 * @param {Name} dataName The name of data to be signed.
 * @returns {Name} An empty name because cannot infer.
 */
SelfVerifyPolicyManager.prototype.inferSigningIdentity = function(dataName)
{
  return new Name();
};

/**
 * Check the type of signatureInfo to get the KeyLocator. Use the public key
 * DER in the KeyLocator (if available) or look in the IdentityStorage for the
 * public key with the name in the KeyLocator (if available) and use it to
 * verify the signedBlob. If the public key can't be found, return false.
 * (This is a generalized method which can verify both a Data packet and an
 * interest.)
 * @param {Signature} signatureInfo An object of a subclass of Signature, e.g.
 * Sha256WithRsaSignature.
 * @param {SignedBlob} signedBlob the SignedBlob with the signed portion to
 * verify.
 * @returns {boolean} True if the signature is verified, false if failed.
 */
SelfVerifyPolicyManager.prototype.verify = function(signatureInfo, signedBlob)
{
  var signature = signatureInfo;
  /*
  if (!signature)
    throw new SecurityException(new Error
      ("SelfVerifyPolicyManager: Signature is not Sha256WithRsaSignature.");
  */

  if (signature.getKeyLocator().getType() == KeyLocatorType.KEY)
    // Use the public key DER directly.
    return SelfVerifyPolicyManager.verifySha256WithRsaSignature
      (signature, signedBlob, signature.getKeyLocator().getKeyData());
  else if (signature.getKeyLocator().getType() == KeyLocatorType.KEYNAME &&
           this.identityStorage != null) {
    // Assume the key name is a certificate name.
    var publicKeyDer = this.identityStorage.getKey
      (IdentityCertificate.certificateNameToPublicKeyName
       (signature.getKeyLocator().getKeyName()));
    if (publicKeyDer.isNull())
      // Can't find the public key with the name.
      return false;

    return SelfVerifyPolicyManager.verifySha256WithRsaSignature
      (signature, signedBlob, publicKeyDer);
  }
  else
    // Can't find a key to verify.
    return false;
};

// The first time verify is called, it sets this to determine if a signature
//   buffer needs to be converted to a string for the crypto verifier.
SelfVerifyPolicyManager.verifyUsesString = null;

/**
 * Verify the RSA signature on the SignedBlob using the given public key.
 * TODO: Move this general verification code to a more central location.
 * @param signature {Sha256WithRsaSignature} The Sha256WithRsaSignature.
 * @param signedBlob {SignedBlob} the SignedBlob with the signed portion to
 * verify.
 * @param publicKeyDer {Blob} The DER-encoded public key used to verify the
 * signature.
 * @returns true if the signature verifies, false if not.
 */
SelfVerifyPolicyManager.verifySha256WithRsaSignature = function
  (signature, signedBlob, publicKeyDer)
{
  if (SelfVerifyPolicyManager.verifyUsesString === null) {
    var hashResult = require("crypto").createHash('sha256').digest();
    // If the hash result is a string, we assume that this is a version of
    //   crypto where verify also uses a string signature.
    SelfVerifyPolicyManager.verifyUsesString = (typeof hashResult === 'string');
  }

  // The crypto verifier requires a PEM-encoded public key.
  var keyBase64 = publicKeyDer.buf().toString('base64');
  var keyPem = "-----BEGIN PUBLIC KEY-----\n";
  for (var i = 0; i < keyBase64.length; i += 64)
    keyPem += (keyBase64.substr(i, 64) + "\n");
  keyPem += "-----END PUBLIC KEY-----";

  var verifier = require('crypto').createVerify('RSA-SHA256');
  verifier.update(signedBlob.signedBuf());
  var signatureBytes = Data.verifyUsesString ?
    DataUtils.toString(signature.getSignature().buf()) :
    signature.getSignature().buf();
  return verifier.verify(keyPem, signatureBytes);
};

},{"../../data.js":28,"../../encoding/data-utils.js":33,"../../encoding/wire-format.js":44,"../../key-locator.js":51,"../../name.js":55,"../certificate/identity-certificate.js":58,"../security-exception.js":71,"./policy-manager.js":68,"crypto":7}],70:[function(require,module,exports){
/**
 * Copyright (C) 2014 Regents of the University of California.
 * @author: Jeff Thompson <jefft0@remap.ucla.edu>
 * From ndn-cxx security by Yingdi Yu <yingdi@cs.ucla.edu>.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 * A copy of the GNU General Public License is in the file COPYING.
 */

/**
 * A ValidationRequest is used to return information from
 * PolicyManager.checkVerificationPolicy.
 *
 * Create a new ValidationRequest with the given values.
 * @param {Interest} interest An interest for fetching more data.
 * @param {function} onVerified If the signature is verified, this calls
 * onVerified(data).
 * @param {function} onVerifyFailed If the signature check fails, this calls
 * onVerifyFailed(data).
 * @param {boolean} retry
 * @param {number} stepCount  The number of verification steps that have been
 * done, used to track the verification progress.
 * @constructor
 */
var ValidationRequest = function ValidationRequest
  (interest, onVerified, onVerifyFailed, retry, stepCount)
{
  this.interest = interest;
  this.onVerified = onVerified;
  this.onVerifyFailed = onVerifyFailed;
  this.retry = retry;
  this.stepCount = stepCount;
};

exports.ValidationRequest = ValidationRequest;

},{}],71:[function(require,module,exports){
/**
 * Copyright (C) 2014 Regents of the University of California.
 * @author: Jeff Thompson <jefft0@remap.ucla.edu>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 * A copy of the GNU General Public License is in the file COPYING.
 */

/**
 * Create a new SecurityException to report an exception from the security
 * library, wrapping the given error object.
 * Call with: throw new SecurityException(new Error("message")).
 * @constructor
 * @param {Error} error The exception created with new Error.
 */
function SecurityException(error)
{
  this.message = error.message;
  // Copy lineNumber, etc. from where new Error was called.
  for (var prop in error)
      this[prop] = error[prop];
}
SecurityException.prototype = new Error();
SecurityException.prototype.name = "SecurityException";

exports.SecurityException = SecurityException;

},{}],72:[function(require,module,exports){
/**
 * Copyright (C) 2014 Regents of the University of California.
 * @author: Jeff Thompson <jefft0@remap.ucla.edu>
 * From ndn-cxx security by Yingdi Yu <yingdi@cs.ucla.edu>.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 * A copy of the GNU General Public License is in the file COPYING.
 */

/**
 * This module defines constants used by the security library.
 */

/**
 * The KeyType integer is used by the Sqlite key storage, so don't change them.
 * Make these the same as ndn-cpp in case the Sqlite file is shared.
 * @constructor
 */
var KeyType = function KeyType()
{
}

exports.KeyType = KeyType;

KeyType.RSA = 0;
KeyType.AES = 1;
// KeyType.DSA
// KeyType.DES
// KeyType.RC4
// KeyType.RC2
KeyType.EC = 2;

var KeyClass = function KeyClass()
{
};

exports.KeyClass = KeyClass;

KeyClass.PUBLIC = 1;
KeyClass.PRIVATE = 2;
KeyClass.SYMMETRIC = 3;

var DigestAlgorithm = function DigestAlgorithm()
{
};

exports.DigestAlgorithm = DigestAlgorithm;

DigestAlgorithm.SHA256 = 1;
// DigestAlgorithm.MD2
// DigestAlgorithm.MD5
// DigestAlgorithm.SHA1

var EncryptMode = function EncryptMode()
{
};

exports.EncryptMode = EncryptMode;

EncryptMode.DEFAULT = 1;
EncryptMode.CFB_AES = 2;
// EncryptMode.CBC_AES

},{}],73:[function(require,module,exports){
(function (Buffer){
/**
 * This class represents an NDN Data Signature object.
 * Copyright (C) 2014 Regents of the University of California.
 * @author: Meki Cheraoui
 * @author: Jeff Thompson <jefft0@remap.ucla.edu>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 * A copy of the GNU General Public License is in the file COPYING.
 */

var Blob = require('./util/blob.js').Blob;
var BinaryXMLEncoder = require('./encoding/binary-xml-encoder.js').BinaryXMLEncoder;
var BinaryXMLDecoder = require('./encoding/binary-xml-decoder.js').BinaryXMLDecoder;
var NDNProtocolDTags = require('./util/ndn-protoco-id-tags.js').NDNProtocolDTags;
var KeyLocator = require('./key-locator.js').KeyLocator;
var LOG = require('./log.js').Log.LOG;

/**
 * Create a new Sha256WithRsaSignature object, possibly copying values from
 * another object.
 *
 * @param {Sha256WithRsaSignature} value (optional) If value is a
 * Sha256WithRsaSignature, copy its values.  If value is omitted, the keyLocator
 * is the default with unspecified values and the signature is unspecified.
 * @constructor
 */
var Sha256WithRsaSignature = function Sha256WithRsaSignature(value)
{
  if (typeof value === 'object' && value instanceof Sha256WithRsaSignature) {
    // Copy the values.
    this.keyLocator = new KeyLocator(value.keyLocator);
    this.signature = value.signature;
    // witness is deprecated.
    this.witness = value.witness;
    // digestAlgorithm is deprecated.
    this.digestAlgorithm = value.digestAlgorithm;
  }
  else {
    this.keyLocator = new KeyLocator();
    this.signature = null;
    // witness is deprecated.
    this.witness = null;
    // digestAlgorithm is deprecated.
    this.digestAlgorithm = null;
  }
};

exports.Sha256WithRsaSignature = Sha256WithRsaSignature;

/**
 * Create a new Sha256WithRsaSignature which is a copy of this object.
 * @returns {Sha256WithRsaSignature} A new object which is a copy of this object.
 */
Sha256WithRsaSignature.prototype.clone = function()
{
  return new Sha256WithRsaSignature(this);
};

/**
 * Get the key locator.
 * @returns {KeyLocator} The key locator.
 */
Sha256WithRsaSignature.prototype.getKeyLocator = function()
{
  return this.keyLocator;
};

/**
 * Get the data packet's signature bytes.
 * @returns {Blob} The signature bytes. If not specified, the value isNull().
 */
Sha256WithRsaSignature.prototype.getSignature = function()
{
  // For backwards-compatibility, leave this.signature as a Buffer but return a Blob.
  return new Blob(this.signature, false);
};

/**
 * @deprecated Use getSignature. This method returns a Buffer which is the former
 * behavior of getSignature, and should only be used while updating your code.
 */
Sha256WithRsaSignature.prototype.getSignatureAsBuffer = function()
{
  return this.signature;
};

/**
 * Set the key locator to a copy of the given keyLocator.
 * @param {KeyLocator} keyLocator The KeyLocator to copy.
 */
Sha256WithRsaSignature.prototype.setKeyLocator = function(keyLocator)
{
  this.keyLocator = typeof keyLocator === 'object' && keyLocator instanceof KeyLocator ?
                    new KeyLocator(keyLocator) : new KeyLocator();
};

/**
 * Set the data packet's signature bytes.
 * @param {Blob} signature
 */
Sha256WithRsaSignature.prototype.setSignature = function(signature)
{
  if (signature == null)
    this.signature = null;
  else if (typeof signature === 'object' && signature instanceof Blob)
    this.signature = new Buffer(signature.buf());
  else
    this.signature = new Buffer(signature);
};

Sha256WithRsaSignature.prototype.from_ndnb = function(decoder)
{
  decoder.readElementStartDTag(this.getElementLabel());

  if (LOG > 4) console.log('STARTED DECODING SIGNATURE');

  if (decoder.peekDTag(NDNProtocolDTags.DigestAlgorithm)) {
    if (LOG > 4) console.log('DIGIEST ALGORITHM FOUND');
    this.digestAlgorithm = decoder.readUTF8DTagElement(NDNProtocolDTags.DigestAlgorithm);
  }
  if (decoder.peekDTag(NDNProtocolDTags.Witness)) {
    if (LOG > 4) console.log('WITNESS FOUND');
    this.witness = decoder.readBinaryDTagElement(NDNProtocolDTags.Witness);
  }

  //FORCE TO READ A SIGNATURE

  if (LOG > 4) console.log('SIGNATURE FOUND');
  this.signature = decoder.readBinaryDTagElement(NDNProtocolDTags.SignatureBits);

  decoder.readElementClose();
};

Sha256WithRsaSignature.prototype.to_ndnb = function(encoder)
{
  if (!this.validate())
    throw new Error("Cannot encode: field values missing.");

  encoder.writeElementStartDTag(this.getElementLabel());

  if (null != this.digestAlgorithm && !this.digestAlgorithm.equals(NDNDigestHelper.DEFAULT_DIGEST_ALGORITHM))
    encoder.writeDTagElement(NDNProtocolDTags.DigestAlgorithm, OIDLookup.getDigestOID(this.DigestAlgorithm));

  if (null != this.witness)
    // needs to handle null witness
    encoder.writeDTagElement(NDNProtocolDTags.Witness, this.witness);

  encoder.writeDTagElement(NDNProtocolDTags.SignatureBits, this.signature);

  encoder.writeElementClose();
};

Sha256WithRsaSignature.prototype.getElementLabel = function() { return NDNProtocolDTags.Signature; };

Sha256WithRsaSignature.prototype.validate = function()
{
  return this.getSignature().size() > 0;
};

/**
 * Note: This Signature class is not the same as the base Signature class of
 * the Common Client Libraries API. It is a deprecated name for
 * Sha256WithRsaSignature. In the future, after we remove this deprecated class,
 * we may implement the CCL version of Signature.
 * @deprecated Use new Sha256WithRsaSignature.
 */
var Signature = function Signature
  (witnessOrSignatureObject, signature, digestAlgorithm)
{
  if (typeof witnessOrSignatureObject === 'object' &&
      witnessOrSignatureObject instanceof Sha256WithRsaSignature)
    // Call the base copy constructor.
    Sha256WithRsaSignature.call(this, witnessOrSignatureObject);
  else {
    // Call the base default constructor.
    Sha256WithRsaSignature.call(this);

    // Set the given fields (if supplied).
    if (witnessOrSignatureObject != null)
      // witness is deprecated.
      this.witness = witnessOrSignatureObject;
    if (signature != null)
      this.signature = signature;
    if (digestAlgorithm != null)
      // digestAlgorithm is deprecated.
      this.digestAlgorithm = digestAlgorithm;
  }
}

Signature.prototype = new Sha256WithRsaSignature();

exports.Signature = Signature;

}).call(this,require("buffer").Buffer)
},{"./encoding/binary-xml-decoder.js":29,"./encoding/binary-xml-encoder.js":30,"./key-locator.js":51,"./log.js":53,"./util/blob.js":77,"./util/ndn-protoco-id-tags.js":81,"buffer":3}],74:[function(require,module,exports){
/**
 * Copyright (C) 2014 Regents of the University of California.
 * @author: Jeff Thompson <jefft0@remap.ucla.edu>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 * A copy of the GNU General Public License is in the file COPYING.
 */

/**
 * Transport is a base class for specific transport classes such as TcpTransport.
 */
var Transport = function Transport()
{
};

exports.Transport = Transport;

/**
 * Transport.ConnectionInfo is a base class for connection information used by
 * subclasses of Transport.
 */
Transport.ConnectionInfo = function TransportConnectionInfo()
{
};
},{}],75:[function(require,module,exports){
(function (Buffer){
/**
 * Copyright (C) 2014 Regents of the University of California.
 * @author: Jeff Thompson <jefft0@remap.ucla.edu>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 * A copy of the GNU General Public License is in the file COPYING.
 */

var ElementReader = require('../encoding/element-reader.js').ElementReader;
var LOG = require('../log.js').Log.LOG;
var Transport = require('./transport.js').Transport;

/**
 * A UnixTransport connects to the forwarder using a Unix socket for Node.js.
 */
var UnixTransport = function UnixTransport()
{
  // Call the base constructor.
  Transport.call(this);

  this.socket = null;
  this.sock_ready = false;
  this.elementReader = null;
  this.connectionInfo = null; // Read by Face.

  // There is no "round robin" search for the local forwarder.
  this.defaultGetConnectionInfo = null;
};

UnixTransport.prototype = new Transport();
UnixTransport.prototype.name = "UnixTransport";

exports.UnixTransport = UnixTransport;

/**
 * Create a new UnixTransport.ConnectionInfo which extends
 * Transport.ConnectionInfo to hold the socket file path for the Unix
 * socket connection.
 * @param {string} filePath The file path of the Unix socket file.
 */
UnixTransport.ConnectionInfo = function UnixTransportConnectionInfo(filePath)
{
  // Call the base constructor.
  Transport.ConnectionInfo .call(this);

  this.filePath = filePath;
};

UnixTransport.ConnectionInfo.prototype = new Transport.ConnectionInfo();
UnixTransport.ConnectionInfo.prototype.name = "UnixTransport.ConnectionInfo";

/**
 * Check if the fields of this UnixTransport.ConnectionInfo equal the other
 * UnixTransport.ConnectionInfo.
 * @param {UnixTransport.ConnectionInfo} The other object to check.
 * @returns {boolean} True if the objects have equal fields, false if not.
 */
UnixTransport.ConnectionInfo.prototype.equals = function(other)
{
  if (other == null || other.filePath == undefined)
    return false;
  return this.filePath == other.filePath;
};

UnixTransport.ConnectionInfo.prototype.toString = function()
{
  return "{ filePath: " + this.filePath + " }";
};

/**
 * Connect to a Unix socket according to the info in connectionInfo. Listen on
 * the port to read an entire packet element and call
 * elementListener.onReceivedElement(element). Note: this connect method
 * previously took a Face object which is deprecated and renamed as the method
 * connectByFace.
 * @param {UnixTransport.ConnectionInfo} connectionInfo A
 * UnixTransport.ConnectionInfo with the Unix socket filePath.
 * @param {object} elementListener The elementListener with function
 * onReceivedElement which must remain valid during the life of this object.
 * @param {function} onopenCallback Once connected, call onopenCallback().
 * @param {type} onclosedCallback If the connection is closed by the remote host,
 * call onclosedCallback().
 * @returns {undefined}
 */
UnixTransport.prototype.connect = function
  (connectionInfo, elementListener, onopenCallback, onclosedCallback)
{
  if (this.socket != null)
    delete this.socket;

  this.elementReader = new ElementReader(elementListener);

  var net = require('net');
  this.socket = new net.createConnection(connectionInfo.filePath);

  var thisTransport = this;

  this.socket.on('data', function(data) {
    if (typeof data == 'object') {
      // Make a copy of data (maybe a Buffer or a String)
      var buf = new Buffer(data);
      try {
        // Find the end of the packet element and call face.onReceivedElement.
        thisTransport.elementReader.onReceivedData(buf);
      } catch (ex) {
        console.log("NDN.UnixTransport.ondata exception: " + ex);
        return;
      }
    }
  });

  this.socket.on('connect', function() {
    if (LOG > 3) console.log('socket.onopen: Unix socket connection opened.');

    thisTransport.sock_ready = true;

    onopenCallback();
  });

  this.socket.on('error', function() {
    if (LOG > 3) console.log('socket.onerror: Unix socket error');
  });

  this.socket.on('close', function() {
    if (LOG > 3) console.log('socket.onclose: Unix socket connection closed.');

    thisTransport.socket = null;

    onclosedCallback();
  });

  this.connectionInfo = connectionInfo;
};

/**
 * Send data.
 */
UnixTransport.prototype.send = function(/*Buffer*/ data)
{
  if (this.sock_ready)
    this.socket.write(data);
  else
    console.log('Unix socket connection is not established.');
};

/**
 * Close transport
 */
UnixTransport.prototype.close = function()
{
  this.socket.end();
  if (LOG > 3) console.log('Unix socket connection closed.');
};

}).call(this,require("buffer").Buffer)
},{"../encoding/element-reader.js":35,"../log.js":53,"./transport.js":74,"buffer":3,"net":2}],76:[function(require,module,exports){
(function (Buffer){
/**
 * Copyright (C) 2013-2014 Regents of the University of California.
 * @author: Wentao Shang
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 * A copy of the GNU General Public License is in the file COPYING.
 */

var ElementReader = require('../encoding/element-reader.js').ElementReader;
var LOG = require('../log.js').Log.LOG;
var Transport = require('./transport.js').Transport;

/**
 * @constructor
 */
var WebSocketTransport = function WebSocketTransport()
{
  // Call the base constructor.
  Transport.call(this);

  if (!WebSocket)
    throw new Error("WebSocket support is not available on this platform.");

  this.ws = null;
  this.connectionInfo = null; // Read by Face.
  this.elementReader = null;
  this.defaultGetConnectionInfo = Face.makeShuffledHostGetConnectionInfo
    (["A.ws.ndn.ucla.edu", "B.ws.ndn.ucla.edu", "C.ws.ndn.ucla.edu", "D.ws.ndn.ucla.edu",
      "E.ws.ndn.ucla.edu", "F.ws.ndn.ucla.edu", "G.ws.ndn.ucla.edu", "H.ws.ndn.ucla.edu",
      "I.ws.ndn.ucla.edu", "J.ws.ndn.ucla.edu", "K.ws.ndn.ucla.edu", "L.ws.ndn.ucla.edu",
      "M.ws.ndn.ucla.edu", "N.ws.ndn.ucla.edu"],
     9696,
     function(host, port) { return new WebSocketTransport.ConnectionInfo(host, port); });
};

WebSocketTransport.prototype = new Transport();
WebSocketTransport.prototype.name = "WebSocketTransport";

exports.WebSocketTransport = WebSocketTransport;

/**
 * Create a new WebSocketTransport.ConnectionInfo which extends
 * Transport.ConnectionInfo to hold the host and port info for the WebSocket
 * connection.
 * @param {string} host The host for the connection.
 * @param {number} port (optional) The port number for the connection. If
 * omitted, use 9696.
 */
WebSocketTransport.ConnectionInfo = function WebSocketTransportConnectionInfo
  (host, port)
{
  // Call the base constructor.
  Transport.ConnectionInfo .call(this);

  port = (port !== undefined ? port : 9696);

  this.host = host;
  this.port = port;
};

WebSocketTransport.ConnectionInfo.prototype = new Transport.ConnectionInfo();
WebSocketTransport.ConnectionInfo.prototype.name = "WebSocketTransport.ConnectionInfo";

/**
 * Check if the fields of this WebSocketTransport.ConnectionInfo equal the other
 * WebSocketTransport.ConnectionInfo.
 * @param {WebSocketTransport.ConnectionInfo} The other object to check.
 * @returns {boolean} True if the objects have equal fields, false if not.
 */
WebSocketTransport.ConnectionInfo.prototype.equals = function(other)
{
  if (other == null || other.host == undefined || other.port == undefined)
    return false;
  return this.host == other.host && this.port == other.port;
};

WebSocketTransport.ConnectionInfo.prototype.toString = function()
{
  return "{ host: " + this.host + ", port: " + this.port + " }";
};

/**
 * Connect to a WebSocket according to the info in connectionInfo. Listen on
 * the port to read an entire packet element and call
 * elementListener.onReceivedElement(element). Note: this connect method
 * previously took a Face object which is deprecated and renamed as the method
 * connectByFace.
 * @param {WebSocketTransport.ConnectionInfo} connectionInfo A
 * WebSocketTransport.ConnectionInfo with the host and port.
 * @param {object} elementListener The elementListener with function
 * onReceivedElement which must remain valid during the life of this object.
 * @param {function} onopenCallback Once connected, call onopenCallback().
 * @param {type} onclosedCallback If the connection is closed by the remote host,
 * call onclosedCallback().
 * @returns {undefined}
 */
WebSocketTransport.prototype.connect = function
  (connectionInfo, elementListener, onopenCallback, onclosedCallback)
{
  this.close();

  this.ws = new WebSocket('ws://' + connectionInfo.host + ':' + connectionInfo.port);
  if (LOG > 0) console.log('ws connection created.');
    this.connectionInfo = connectionInfo;

  this.ws.binaryType = "arraybuffer";

  this.elementReader = new ElementReader(elementListener);
  var self = this;
  this.ws.onmessage = function(ev) {
    var result = ev.data;
    //console.log('RecvHandle called.');

    if (result == null || result == undefined || result == "") {
      console.log('INVALID ANSWER');
    }
    else if (result instanceof ArrayBuffer) {
      var bytearray = new Buffer(result);

      if (LOG > 3) console.log('BINARY RESPONSE IS ' + bytearray.toString('hex'));

      try {
        // Find the end of the binary XML element and call face.onReceivedElement.
        self.elementReader.onReceivedData(bytearray);
      } catch (ex) {
        console.log("NDN.ws.onmessage exception: " + ex);
        return;
      }
    }
  }

  this.ws.onopen = function(ev) {
    if (LOG > 3) console.log(ev);
    if (LOG > 3) console.log('ws.onopen: WebSocket connection opened.');
    if (LOG > 3) console.log('ws.onopen: ReadyState: ' + this.readyState);
    // Face.registerPrefix will fetch the ndndid when needed.

    onopenCallback();
  }

  this.ws.onerror = function(ev) {
    console.log('ws.onerror: ReadyState: ' + this.readyState);
    console.log(ev);
    console.log('ws.onerror: WebSocket error: ' + ev.data);
  }

  this.ws.onclose = function(ev) {
    console.log('ws.onclose: WebSocket connection closed.');
    self.ws = null;

    onclosedCallback();
  }
};

/**
 * @deprecated This is deprecated. You should not call Transport.connect
 * directly, since it is called by Face methods.
 */
WebSocketTransport.prototype.connectByFace = function(face, onopenCallback)
{
  this.connect
    (face.connectionInfo, face, onopenCallback,
     function() { face.closeByTransport(); });
};

/**
 * Send the Uint8Array data.
 */
WebSocketTransport.prototype.send = function(data)
{
  if (this.ws != null) {
    // If we directly use data.buffer to feed ws.send(),
    // WebSocket may end up sending a packet with 10000 bytes of data.
    // That is, WebSocket will flush the entire buffer
    // regardless of the offset of the Uint8Array. So we have to create
    // a new Uint8Array buffer with just the right size and copy the
    // content from binaryInterest to the new buffer.
    //    ---Wentao
    var bytearray = new Uint8Array(data.length);
    bytearray.set(data);
    this.ws.send(bytearray.buffer);
    if (LOG > 3) console.log('ws.send() returned.');
  }
  else
    console.log('WebSocket connection is not established.');
};

/**
 * Close the connection.
 */
WebSocketTransport.prototype.close = function()
{
  if (this.ws != null)
    delete this.ws;
}


}).call(this,require("buffer").Buffer)
},{"../encoding/element-reader.js":35,"../log.js":53,"./transport.js":74,"buffer":3}],77:[function(require,module,exports){
(function (Buffer){
/**
 * Copyright (C) 2013 Regents of the University of California.
 * @author: Jeff Thompson <jefft0@remap.ucla.edu>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 * A copy of the GNU General Public License is in the file COPYING.
 */

/**
 * A Blob holds an immutable byte array implemented as a Buffer.  This should be
 * treated like a string which is a pointer to an immutable string. (It is OK to
 * pass a pointer to the string because the new owner can’t change the bytes of
 * the string.)  Blob does not inherit from Buffer. Instead you must call buf()
 * to get the byte array which reminds you that you should not change the
 * contents.  Also remember that buf() can return null.
 * @param {Blob|Buffer|Array<number>} value (optional) If value is a Blob, take
 * another pointer to the Buffer without copying. If value is a Buffer or byte
 * array, copy to create a new Buffer.  If omitted, buf() will return null.
 * @param {boolean} copy (optional) (optional) If true, copy the contents of
 * value into a new Buffer.  If false, just use the existing value without
 * copying. If omitted, then copy the contents (unless value is already a Blob).
 * IMPORTANT: If copy is false, if you keep a pointer to the value then you must
 * treat the value as immutable and promise not to change it.
 */
var Blob = function Blob(value, copy)
{
  if (copy == null)
    copy = true;

  if (value == null)
    this.buffer = null;
  else if (typeof value === 'object' && value instanceof Blob)
    // Use the existing buffer.  Don't need to check for copy.
    this.buffer = value.buffer;
  else {
    if (typeof value === 'string')
      // Convert from a string to utf-8 byte encoding.
      this.buffer = new Buffer(value, 'utf8');
    else {
      if (copy)
        // We are copying, so just make another Buffer.
        this.buffer = new Buffer(value);
      else {
        if (Buffer.isBuffer(value))
          // We can use as-is.
          this.buffer = value;
        else
          // We need a Buffer, so copy.
          this.buffer = new Buffer(value);
      }
    }
  }

  // Set the length to be "JavaScript-like".
  this.length = this.buffer != null ? this.buffer.length : 0;
};

exports.Blob = Blob;

/**
 * Return the length of the immutable byte array.
 * @returns {number} The length of the array.  If buf() is null, return 0.
 */
Blob.prototype.size = function()
{
  if (this.buffer != null)
    return this.buffer.length;
  else
    return 0;
};

/**
 * Return the immutable byte array.  DO NOT change the contents of the Buffer.
 * If you need to change it, make a copy.
 * @returns {Buffer} The Buffer holding the immutable byte array, or null.
 */
Blob.prototype.buf = function()
{
  return this.buffer;
};

/**
 * Return true if the array is null, otherwise false.
 * @returns {boolean} True if the array is null.
 */
Blob.prototype.isNull = function()
{
  return this.buffer == null;
};

/**
 * Return the hex representation of the bytes in the byte array.
 * @returns {string} The hex string.
 */
Blob.prototype.toHex = function()
{
  if (this.buffer == null)
    return "";
  else
    return this.buffer.toString('hex');
};

/**
 * Check if the value of this Blob equals the other blob.
 * @param {Blob} other The other Blob to check.
 * @returns {boolean} if this isNull and other isNull or if the bytes of this
 * blob equal the bytes of the other.
 */
Blob.prototype.equals = function(other)
{
  if (this.isNull())
    return other.isNull();
  else if (other.isNull())
    return false;
  else {
    if (this.buffer.length != other.buffer.length)
      return false;

    for (var i = 0; i < this.buffer.length; ++i) {
      if (this.buffer[i] != other.buffer[i])
        return false;
    }

    return true;
  }
};
}).call(this,require("buffer").Buffer)
},{"buffer":3}],78:[function(require,module,exports){
(function (Buffer){
/**
 * Encapsulate a Buffer and support dynamic reallocation.
 * Copyright (C) 2013-2014 Regents of the University of California.
 * @author: Jeff Thompson <jefft0@remap.ucla.edu>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 * A copy of the GNU General Public License is in the file COPYING.
 */

/**
 * Create a DynamicBuffer where this.array is a Buffer of size length.
 * To access the array, use this.array or call slice.
 * @constructor
 * @param {number} length the initial length of the array.  If null, use a default.
 */
var DynamicBuffer = function DynamicBuffer(length)
{
  if (!length)
    length = 16;

  this.array = new Buffer(length);
};

exports.DynamicBuffer = DynamicBuffer;

/**
 * Ensure that this.array has the length, reallocate and copy if necessary.
 * Update the length of this.array which may be greater than length.
 * @param {number} length The minimum length for the array.
 */
DynamicBuffer.prototype.ensureLength = function(length)
{
  if (this.array.length >= length)
    return;

  // See if double is enough.
  var newLength = this.array.length * 2;
  if (length > newLength)
    // The needed length is much greater, so use it.
    newLength = length;

  var newArray = new Buffer(newLength);
  this.array.copy(newArray);
  this.array = newArray;
};

/**
 * Copy the value to this.array at offset, reallocating if necessary.
 * @param {Buffer} value The buffer to copy.
 * @param {number} offset The offset in the buffer to start copying into.
 */
DynamicBuffer.prototype.copy = function(value, offset)
{
  this.ensureLength(value.length + offset);

  if (Buffer.isBuffer(value))
    value.copy(this.array, offset);
  else
    // Need to make value a Buffer to copy.
    new Buffer(value).copy(this.array, offset);
};

/**
 * Ensure that this.array has the length. If necessary, reallocate the array
 *   and shift existing data to the back of the new array.
 * Update the length of this.array which may be greater than length.
 * @param {number} length The minimum length for the array.
 */
DynamicBuffer.prototype.ensureLengthFromBack = function(length)
{
  if (this.array.length >= length)
    return;

  // See if double is enough.
  var newLength = this.array.length * 2;
  if (length > newLength)
    // The needed length is much greater, so use it.
    newLength = length;

  var newArray = new Buffer(newLength);
  // Copy to the back of newArray.
  this.array.copy(newArray, newArray.length - this.array.length);
  this.array = newArray;
};

/**
 * First call ensureLengthFromBack to make sure the bytearray has
 * offsetFromBack bytes, then copy value into the array starting
 * offsetFromBack bytes from the back of the array.
 * @param {Buffer} value The buffer to copy.
 * @param {offsetFromBack} offset The offset from the back of the array to start
 * copying.
 */
DynamicBuffer.prototype.copyFromBack = function(value, offsetFromBack)
{
  this.ensureLengthFromBack(offsetFromBack);

  if (Buffer.isBuffer(value))
    value.copy(this.array, this.array.length - offsetFromBack);
  else
    // Need to make value a Buffer to copy.
    new Buffer(value).copy(this.array, this.array.length - offsetFromBack);
};

/**
 * Return this.array.slice(begin, end);
 * @param {number} begin The begin index for the slice.
 * @param {number} end The end index for the slice.
 * @returns {Buffer} The buffer slice.
 */
DynamicBuffer.prototype.slice = function(begin, end)
{
  return this.array.slice(begin, end);
};

}).call(this,require("buffer").Buffer)
},{"buffer":3}],79:[function(require,module,exports){
/**
 * Copyright (C) 2014 Regents of the University of California.
 * @author: Jeff Thompson <jefft0@remap.ucla.edu>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 * A copy of the GNU General Public License is in the file COPYING.
 */

var Name = require('../name.js').Name;

/**
 * A MemoryContentCache holds a set of Data packets and answers an Interest to
 * return the correct Data packet. The cache is periodically cleaned up to
 * remove each stale Data packet based on its FreshnessPeriod (if it has one).
 * @note This class is an experimental feature.  See the API docs for more detail at
 * http://named-data.net/doc/ndn-ccl-api/memory-content-cache.html .
 *
 * Create a new MemoryContentCache to use the given Face.
 *
 * @param {Face} face The Face to use to call registerPrefix and which will call
 * the OnInterest callback.
 * @param {number} cleanupIntervalMilliseconds (optional) The interval
 * in milliseconds between each check to clean up stale content in the cache. If
 * omitted, use a default of 1000 milliseconds. If this is a large number, then
 * effectively the stale content will not be removed from the cache.
 */
var MemoryContentCache = function MemoryContentCache
  (face, cleanupIntervalMilliseconds)
{
  cleanupIntervalMilliseconds = (cleanupIntervalMilliseconds || 1000.0);

  this.face = face;
  this.cleanupIntervalMilliseconds = cleanupIntervalMilliseconds;
  this.nextCleanupTime = new Date().getTime() + cleanupIntervalMilliseconds;

  this.onDataNotFoundForPrefix = {}; /**< The map key is the prefix.toUri().
 *                                        The value is an OnInterest function. */
  this.noStaleTimeCache = []; /**< elements are MemoryContentCache.Content */
  this.staleTimeCache = [];   /**< elements are MemoryContentCache.StaleTimeContent */
  //StaleTimeContent::Compare contentCompare_;
  this.emptyComponent = new Name.Component();
};

exports.MemoryContentCache = MemoryContentCache;

/**
 * Call registerPrefix on the Face given to the constructor so that this
 * MemoryContentCache will answer interests whose name has the prefix.
 * @param {Name} prefix The Name for the prefix to register. This copies the Name.
 * @param {function} onRegisterFailed If this fails to register the prefix for
 * any reason, this calls onRegisterFailed(prefix) where prefix is the prefix
 * given to registerPrefix.
 * @param {function} onDataNotFound (optional) If a data packet is not found in
 * the cache, this calls onInterest(prefix, interest, transport) to forward the
 * interest. If omitted, this does not use it.
 * @param {ForwardingFlags} flags (optional) See Face.registerPrefix.
 * @param {WireFormat} wireFormat (optional) See Face.registerPrefix.
 */
MemoryContentCache.prototype.registerPrefix = function
  (prefix, onRegisterFailed, onDataNotFound, flags, wireFormat)
{
  if (onDataNotFound)
    this.onDataNotFoundForPrefix[prefix.toUri()] = onDataNotFound;
  var thisMemoryContentCache = this;
  this.face.registerPrefix
    (prefix,
     function(prefix, interest, transport)
       { thisMemoryContentCache.onInterest(prefix, interest, transport); },
     onRegisterFailed, flags, wireFormat);
};

/**
 * Add the Data packet to the cache so that it is available to use to answer
 * interests. If data.getFreshnessPeriod() is not null, set the staleness
 * time to now plus data.getFreshnessPeriod(), which is checked during cleanup
 * to remove stale content. This also checks if cleanupIntervalMilliseconds
 * milliseconds have passed and removes stale content from the cache.
 * @param {Data} data The Data packet object to put in the cache. This copies
 * the fields from the object.
 */
MemoryContentCache.prototype.add = function(data)
{
  this.doCleanup();

  if (data.getMetaInfo().getFreshnessPeriod() != null &&
      data.getMetaInfo().getFreshnessPeriod() >= 0.0) {
    // The content will go stale, so use staleTimeCache.
    var content = new MemoryContentCache.StaleTimeContent(data);
    // Insert into staleTimeCache, sorted on content.staleTimeMilliseconds.
    // Search from the back since we expect it to go there.
    var i = this.staleTimeCache.length - 1;
    while (i >= 0) {
      if (this.staleTimeCache[i].staleTimeMilliseconds <= content.staleTimeMilliseconds)
        break;
      --i;
    }
    // Element i is the greatest less than or equal to
    // content.staleTimeMilliseconds, so insert after it.
    this.staleTimeCache.splice(i + 1, 0, content);
  }
  else
    // The data does not go stale, so use noStaleTimeCache.
    this.noStaleTimeCache.push(new MemoryContentCache.Content(data));
}

/**
 * This is the OnInterest callback which is called when the library receives
 * an interest whose name has the prefix given to registerPrefix. First check
 * if cleanupIntervalMilliseconds milliseconds have passed and remove stale
 * content from the cache. Then search the cache for the Data packet, matching
 * any interest selectors including ChildSelector, and send the Data packet
 * to the transport. If no matching Data packet is in the cache, call
 * the callback in onDataNotFoundForPrefix (if defined).
 */
MemoryContentCache.prototype.onInterest = function(prefix, interest, transport)
{
  this.doCleanup();

  var selectedComponent = 0;
  var selectedEncoding = null;
  // We need to iterate over both arrays.
  var totalSize = this.staleTimeCache.length + this.noStaleTimeCache.length;
  for (var i = 0; i < totalSize; ++i) {
    var content;
    if (i < this.staleTimeCache.length)
      content = this.staleTimeCache[i];
    else
      // We have iterated over the first array. Get from the second.
      content = this.noStaleTimeCache[i - this.staleTimeCache.length];

    if (interest.matchesName(content.getName())) {
      if (interest.getChildSelector() < 0) {
        // No child selector, so send the first match that we have found.
        transport.send(content.getDataEncoding());
        return;
      }
      else {
        // Update selectedEncoding based on the child selector.
        var component;
        if (content.getName().size() > interest.getName().size())
          component = content.getName().get(interest.getName().size());
        else
          component = this.emptyComponent;

        var gotBetterMatch = false;
        if (selectedEncoding === null)
          // Save the first match.
          gotBetterMatch = true;
        else {
          if (interest.getChildSelector() == 0) {
            // Leftmost child.
            if (component.compare(selectedComponent) < 0)
              gotBetterMatch = true;
          }
          else {
            // Rightmost child.
            if (component.compare(selectedComponent) > 0)
              gotBetterMatch = true;
          }
        }

        if (gotBetterMatch) {
          selectedComponent = component;
          selectedEncoding = content.getDataEncoding();
        }
      }
    }
  }

  if (selectedEncoding !== null)
    // We found the leftmost or rightmost child.
    transport.send(selectedEncoding);
  else {
    // Call the onDataNotFound callback (if defined).
    var onDataNotFound = this.onDataNotFoundForPrefix[prefix.toUri()];
    if (onDataNotFound)
      // TODO: Include registeredPrefixId.
      onDataNotFound(prefix, interest, transport);
  }
};

/**
 * Check if now is greater than nextCleanupTime and, if so, remove stale
 * content from staleTimeCache and reset nextCleanupTime based on
 * cleanupIntervalMilliseconds. Since add(Data) does a sorted insert into
 * staleTimeCache, the check for stale data is quick and does not require
 * searching the entire staleTimeCache.
 */
MemoryContentCache.prototype.doCleanup = function()
{
  var now = new Date().getTime();
  if (now >= this.nextCleanupTime) {
    // staleTimeCache is sorted on staleTimeMilliseconds, so we only need to
    // erase the stale entries at the front, then quit.
    while (this.staleTimeCache.length > 0 && this.staleTimeCache[0].isStale(now))
      this.staleTimeCache.shift();

    this.nextCleanupTime = now + this.cleanupIntervalMilliseconds;
  }
};

/**
 * Content is a private class to hold the name and encoding for each entry
 * in the cache. This base class is for a Data packet without a FreshnessPeriod.
 *
 * Create a new Content entry to hold data's name and wire encoding.
 * @param {Data} data The Data packet whose name and wire encoding are copied.
 */
MemoryContentCache.Content = function MemoryContentCacheContent(data)
{
  // Allow an undefined data so that StaleTimeContent can set the prototype.
  if (data) {
    // Copy the name.
    this.name = new Name(data.getName());
    // wireEncode returns the cached encoding if available.
    this.dataEncoding = data.wireEncode().buf();
  }
};

MemoryContentCache.Content.prototype.getName = function() { return this.name; };

MemoryContentCache.Content.prototype.getDataEncoding = function() { return this.dataEncoding; };

/**
 * StaleTimeContent extends Content to include the staleTimeMilliseconds for
 * when this entry should be cleaned up from the cache.
 *
 * Create a new StaleTimeContent to hold data's name and wire encoding as well
 * as the staleTimeMilliseconds which is now plus
 * data.getMetaInfo().getFreshnessPeriod().
 * @param {Data} data The Data packet whose name and wire encoding are copied.
 */
MemoryContentCache.StaleTimeContent = function MemoryContentCacheStaleTimeContent
  (data)
{
  // Call the base constructor.
  MemoryContentCache.Content.call(this, data);

  // Set up staleTimeMilliseconds which is The time when the content becomse
  // stale in milliseconds according to new Date().getTime().
  this.staleTimeMilliseconds = new Date().getTime() +
    data.getMetaInfo().getFreshnessPeriod();
};

MemoryContentCache.StaleTimeContent.prototype = new MemoryContentCache.Content();
MemoryContentCache.StaleTimeContent.prototype.name = "StaleTimeContent";

/**
 * Check if this content is stale.
 * @param {number} nowMilliseconds The current time in milliseconds from
 * new Date().getTime().
 * @returns {boolean} true if this interest is stale, otherwise false.
 */
MemoryContentCache.StaleTimeContent.prototype.isStale = function(nowMilliseconds)
{
  return this.staleTimeMilliseconds <= nowMilliseconds;
};

},{"../name.js":55}],80:[function(require,module,exports){
(function (Buffer){
/**
 * Copyright (C) 2013-2014 Regents of the University of California.
 * @author: Jeff Thompson <jefft0@remap.ucla.edu>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 * A copy of the GNU General Public License is in the file COPYING.
 */

var DataUtils = require('../encoding/data-utils.js').DataUtils;
var BinaryXMLDecoder = require('../encoding/binary-xml-decoder.js').BinaryXMLDecoder;
var NDNProtocolDTags = require('./ndn-protoco-id-tags.js').NDNProtocolDTags;
var Name = require('../name.js').Name;

/**
 * Create a context for getting the response from the name enumeration command, as neede by getComponents.
 * (To do name enumeration, call the static method NameEnumeration.getComponents.)
 * @param {Face} face The Face object for using expressInterest.
 * @param {function} onComponents The onComponents callback given to getComponents.
 */
var NameEnumeration = function NameEnumeration(face, onComponents)
{
  this.face = face;
  this.onComponents = onComponents;
  this.contentParts = [];

  var self = this;
  this.onData = function(interest, data) { self.processData(data); };
  this.onTimeout = function(interest) { self.processTimeout(); };
};

exports.NameEnumeration = NameEnumeration;

/**
 * Use the name enumeration protocol to get the child components of the name prefix.
 * @param {Face} face The Face object for using expressInterest.
 * @param {Name} name The name prefix for finding the child components.
 * @param {function} onComponents On getting the response, this calls onComponents(components) where
 * components is an array of Buffer name components.  If there is no response, this calls onComponents(null).
 */
NameEnumeration.getComponents = function(face, prefix, onComponents)
{
  var command = new Name(prefix);
  // Add %C1.E.be
  command.add([0xc1, 0x2e, 0x45, 0x2e, 0x62, 0x65])

  var enumeration = new NameEnumeration(face, onComponents);
  face.expressInterest(command, enumeration.onData, enumeration.onTimeout);
};

/**
 * Parse the response from the name enumeration command and call this.onComponents.
 * @param {Data} data
 */
NameEnumeration.prototype.processData = function(data)
{
  try {
    if (!NameEnumeration.endsWithSegmentNumber(data.getName()))
      // We don't expect a name without a segment number.  Treat it as a bad packet.
      this.onComponents(null);
    else {
      var segmentNumber = data.getName().get(-1).toSegment();

      // Each time we get a segment, we put it in contentParts, so its length follows the segment numbers.
      var expectedSegmentNumber = this.contentParts.length;
      if (segmentNumber != expectedSegmentNumber)
        // Try again to get the expected segment.  This also includes the case where the first segment is not segment 0.
        this.face.expressInterest
          (data.getName().getPrefix(-1).addSegment(expectedSegmentNumber), this.onData, this.onTimeout);
      else {
        // Save the content and check if we are finished.
        this.contentParts.push(data.getContent().buf());

        if (data.getMetaInfo() != null && data.getMetaInfo().getFinalBlockID().getValue().size() > 0) {
          var finalSegmentNumber = data.getMetaInfo().getFinalBlockID().toSegment();
          if (segmentNumber == finalSegmentNumber) {
            // We are finished.  Parse and return the result.
            this.onComponents(NameEnumeration.parseComponents(Buffer.concat(this.contentParts)));
            return;
          }
        }

        // Fetch the next segment.
        this.face.expressInterest
          (data.getName().getPrefix(-1).addSegment(expectedSegmentNumber + 1), this.onData, this.onTimeout);
      }
    }
  } catch (ex) {
    console.log("NameEnumeration: ignoring exception: " + ex);
  }
};

/**
 * Just call onComponents(null).
 */
NameEnumeration.prototype.processTimeout = function()
{
  try {
    this.onComponents(null);
  } catch (ex) {
    console.log("NameEnumeration: ignoring exception: " + ex);
  }
};

/**
 * Parse the content as a name enumeration response and return an array of components.  This makes a copy of the component.
 * @param {Buffer} content The content to parse.
 * @returns {Array<Buffer>} The array of components.
 */
NameEnumeration.parseComponents = function(content)
{
  var components = [];
  var decoder = new BinaryXMLDecoder(content);

  decoder.readElementStartDTag(NDNProtocolDTags.Collection);

  while (decoder.peekDTag(NDNProtocolDTags.Link)) {
    decoder.readElementStartDTag(NDNProtocolDTags.Link);
    decoder.readElementStartDTag(NDNProtocolDTags.Name);

    components.push(new Buffer(decoder.readBinaryDTagElement(NDNProtocolDTags.Component)));

    decoder.readElementClose();
    decoder.readElementClose();
  }

  decoder.readElementClose();
  return components;
};

/**
 * Check if the last component in the name is a segment number.
 * TODO: Move to Name class.
 * @param {Name} name
 * @returns {Boolean} True if the name ends with a segment number, otherwise false.
 */
NameEnumeration.endsWithSegmentNumber = function(name) {
  return name.size() >= 1 &&
         name.get(-1).getValue().size() >= 1 &&
         name.get(-1).getValue().buf()[0] == 0;
};

}).call(this,require("buffer").Buffer)
},{"../encoding/binary-xml-decoder.js":29,"../encoding/data-utils.js":33,"../name.js":55,"./ndn-protoco-id-tags.js":81,"buffer":3}],81:[function(require,module,exports){
/**
 * This class contains all NDNx tags
 * Copyright (C) 2013-2014 Regents of the University of California.
 * @author: Meki Cheraoui
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 * A copy of the GNU General Public License is in the file COPYING.
 */


var NDNProtocolDTags = {

  /**
   * Note if you add one of these, add it to the reverse string map as well.
   * Emphasize getting the work done at compile time over trying to make something
   * flexible and developer error-proof.
   */

   Any : 13,
   Name : 14,
   Component : 15,
   Certificate : 16,
   Collection : 17,
   CompleteName : 18,
   Content : 19,
   SignedInfo : 20,
   ContentDigest : 21,
   ContentHash : 22,
   Count : 24,
   Header : 25,
   Interest : 26,  /* 20090915 */
   Key : 27,
   KeyLocator : 28,
   KeyName : 29,
   Length : 30,
   Link : 31,
   LinkAuthenticator : 32,
   NameComponentCount : 33,  /* DeprecatedInInterest */
   RootDigest : 36,
   Signature : 37,
   Start : 38,
   Timestamp : 39,
   Type : 40,
   Nonce : 41,
   Scope : 42,
   Exclude : 43,
   Bloom : 44,
   BloomSeed : 45,
   AnswerOriginKind : 47,
   InterestLifetime : 48,
   Witness : 53,
   SignatureBits : 54,
   DigestAlgorithm : 55,
   BlockSize : 56,
   FreshnessSeconds : 58,
   FinalBlockID : 59,
   PublisherPublicKeyDigest : 60,
   PublisherCertificateDigest : 61,
   PublisherIssuerKeyDigest : 62,
   PublisherIssuerCertificateDigest : 63,
   Data : 64,  /* 20090915 */
   WrappedKey : 65,
   WrappingKeyIdentifier : 66,
   WrapAlgorithm : 67,
   KeyAlgorithm : 68,
   Label : 69,
   EncryptedKey : 70,
   EncryptedNonceKey : 71,
   WrappingKeyName : 72,
   Action : 73,
   FaceID : 74,
   IPProto : 75,
   Host : 76,
   Port : 77,
   MulticastInterface : 78,
   ForwardingFlags : 79,
   FaceInstance : 80,
   ForwardingEntry : 81,
   MulticastTTL : 82,
   MinSuffixComponents : 83,
   MaxSuffixComponents : 84,
   ChildSelector : 85,
   RepositoryInfo : 86,
   Version : 87,
   RepositoryVersion : 88,
   GlobalPrefix : 89,
   LocalName : 90,
   Policy : 91,
   Namespace : 92,
   GlobalPrefixName : 93,
   PolicyVersion : 94,
   KeyValueSet : 95,
   KeyValuePair : 96,
   IntegerValue : 97,
   DecimalValue : 98,
   StringValue : 99,
   BinaryValue : 100,
   NameValue : 101,
   Entry : 102,
   ACL : 103,
   ParameterizedName : 104,
   Prefix : 105,
   Suffix : 106,
   Root : 107,
   ProfileName : 108,
   Parameters : 109,
   InfoString : 110,
  // 111 unallocated
   StatusResponse : 112,
   StatusCode : 113,
   StatusText : 114,

  // Sync protocol
   SyncNode : 115,
   SyncNodeKind : 116,
   SyncNodeElement : 117,
   SyncVersion : 118,
   SyncNodeElements : 119,
   SyncContentHash : 120,
   SyncLeafCount : 121,
   SyncTreeDepth : 122,
   SyncByteCount : 123,
   ConfigSlice : 124,
   ConfigSliceList : 125,
   ConfigSliceOp : 126,

  // Remember to keep in sync with schema/tagnames.csvsdict
   NDNProtocolDataUnit : 17702112,
   NDNPROTOCOL_DATA_UNIT : "NDNProtocolDataUnit"
};

exports.NDNProtocolDTags = NDNProtocolDTags;

var NDNProtocolDTagsStrings = [
  null, null, null, null, null, null, null, null, null, null, null,
  null, null,
  "Any", "Name", "Component", "Certificate", "Collection", "CompleteName",
  "Content", "SignedInfo", "ContentDigest", "ContentHash", null, "Count", "Header",
  "Interest", "Key", "KeyLocator", "KeyName", "Length", "Link", "LinkAuthenticator",
  "NameComponentCount", null, null, "RootDigest", "Signature", "Start", "Timestamp", "Type",
  "Nonce", "Scope", "Exclude", "Bloom", "BloomSeed", null, "AnswerOriginKind",
  "InterestLifetime", null, null, null, null, "Witness", "SignatureBits", "DigestAlgorithm", "BlockSize",
  null, "FreshnessSeconds", "FinalBlockID", "PublisherPublicKeyDigest", "PublisherCertificateDigest",
  "PublisherIssuerKeyDigest", "PublisherIssuerCertificateDigest", "Data",
  "WrappedKey", "WrappingKeyIdentifier", "WrapAlgorithm", "KeyAlgorithm", "Label",
  "EncryptedKey", "EncryptedNonceKey", "WrappingKeyName", "Action", "FaceID", "IPProto",
  "Host", "Port", "MulticastInterface", "ForwardingFlags", "FaceInstance",
  "ForwardingEntry", "MulticastTTL", "MinSuffixComponents", "MaxSuffixComponents", "ChildSelector",
  "RepositoryInfo", "Version", "RepositoryVersion", "GlobalPrefix", "LocalName",
  "Policy", "Namespace", "GlobalPrefixName", "PolicyVersion", "KeyValueSet", "KeyValuePair",
  "IntegerValue", "DecimalValue", "StringValue", "BinaryValue", "NameValue", "Entry",
  "ACL", "ParameterizedName", "Prefix", "Suffix", "Root", "ProfileName", "Parameters",
  "InfoString", null,
    "StatusResponse", "StatusCode", "StatusText", "SyncNode", "SyncNodeKind", "SyncNodeElement",
    "SyncVersion", "SyncNodeElements", "SyncContentHash", "SyncLeafCount", "SyncTreeDepth", "SyncByteCount",
    "ConfigSlice", "ConfigSliceList", "ConfigSliceOp" ];

exports.NDNProtocolDTagsStrings = NDNProtocolDTagsStrings;

},{}],82:[function(require,module,exports){
/**
 * This class represents NDNTime Objects
 * Copyright (C) 2013-2014 Regents of the University of California.
 * @author: Meki Cheraoui
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 * A copy of the GNU General Public License is in the file COPYING.
 */

var LOG = require('../log.js').Log.LOG;

/**
 * @constructor
 */
var NDNTime = function NDNTime(input)
{
  this.NANOS_MAX = 999877929;

  if (typeof input =='number')
    this.msec = input;
  else {
    if (LOG > 1) console.log('UNRECOGNIZED TYPE FOR TIME');
  }
};

exports.NDNTime = NDNTime;

NDNTime.prototype.getJavascriptDate = function()
{
  var d = new Date();
  d.setTime(this.msec);
  return d
};

},{"../log.js":53}],83:[function(require,module,exports){
/**
 * Copyright (C) 2013 Regents of the University of California.
 * @author: Jeff Thompson <jefft0@remap.ucla.edu>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 * A copy of the GNU General Public License is in the file COPYING.
 */

var Blob = require('./blob.js').Blob;

/**
 * A SignedBlob extends Blob to keep the offsets of a signed portion (e.g., the
 * bytes of Data packet). This inherits from Blob, including Blob.size and Blob.buf.
 * @param {Blob|Buffer|Array<number>} value (optional) If value is a Blob, take
 * another pointer to the Buffer without copying. If value is a Buffer or byte
 * array, copy to create a new Buffer.  If omitted, buf() will return null.
 * @param {number} signedPortionBeginOffset (optional) The offset in the
 * encoding of the beginning of the signed portion. If omitted, set to 0.
 * @param {number} signedPortionEndOffset (optional) The offset in the encoding
 * of the end of the signed portion. If omitted, set to 0.
 */
var SignedBlob = function SignedBlob(value, signedPortionBeginOffset, signedPortionEndOffset)
{
  // Call the base constructor.
  Blob.call(this, value);

  if (this.buffer == null) {
    this.signedPortionBeginOffset = 0;
    this.signedPortionEndOffset = 0;
  }
  else if (typeof value === 'object' && value instanceof SignedBlob) {
    // Copy the SignedBlob, allowing override for offsets.
    this.signedPortionBeginOffset = signedPortionBeginOffset == null ?
      value.signedPortionBeginOffset : signedPortionBeginOffset;
    this.signedPortionEndOffset = signedPortionEndOffset == null ?
      value.signedPortionEndOffset : signedPortionEndOffset;
  }
  else {
    this.signedPortionBeginOffset = signedPortionBeginOffset || 0;
    this.signedPortionEndOffset = signedPortionEndOffset || 0;
  }

  if (this.buffer == null)
    this.signedBuffer = null;
  else
    this.signedBuffer = this.buffer.slice
      (this.signedPortionBeginOffset, this.signedPortionEndOffset);
};

SignedBlob.prototype = new Blob();
SignedBlob.prototype.name = "SignedBlob";

exports.SignedBlob = SignedBlob;

/**
 * Return the length of the signed portion of the immutable byte array.
 * @returns {number} The length of the signed portion.  If signedBuf() is null,
 * return 0.
 */
SignedBlob.prototype.signedSize = function()
{
  if (this.signedBuffer != null)
    return this.signedBuffer.length;
  else
    return 0;
};

/**
 * Return a the signed portion of the immutable byte array.
 * @returns {Buffer} A slice into the Buffer which is the signed portion.
 * If the pointer to the array is null, return null.
 */
SignedBlob.prototype.signedBuf = function()
{
  if (this.signedBuffer != null)
    return this.signedBuffer;
  else
    return null;
};

/**
 * Return the offset in the array of the beginning of the signed portion.
 * @returns {number} The offset in the array.
 */
SignedBlob.prototype.getSignedPortionBeginOffset = function()
{
  return this.signedPortionBeginOffset;
};

/**
 * Return the offset in the array of the end of the signed portion.
 * @returns {number} The offset in the array.
 */
SignedBlob.prototype.getSignedPortionEndOffset = function()
{
  return this.signedPortionEndOffset;
};

},{"./blob.js":77}],84:[function(require,module,exports){
(function(){
    
    // Copyright (c) 2005  Tom Wu
    // All Rights Reserved.
    // See "LICENSE" for details.

    // Basic JavaScript BN library - subset useful for RSA encryption.

    // Bits per digit
    var dbits;

    // JavaScript engine analysis
    var canary = 0xdeadbeefcafe;
    var j_lm = ((canary&0xffffff)==0xefcafe);

    // (public) Constructor
    function BigInteger(a,b,c) {
      if(a != null)
        if("number" == typeof a) this.fromNumber(a,b,c);
        else if(b == null && "string" != typeof a) this.fromString(a,256);
        else this.fromString(a,b);
    }

    // return new, unset BigInteger
    function nbi() { return new BigInteger(null); }

    // am: Compute w_j += (x*this_i), propagate carries,
    // c is initial carry, returns final carry.
    // c < 3*dvalue, x < 2*dvalue, this_i < dvalue
    // We need to select the fastest one that works in this environment.

    // am1: use a single mult and divide to get the high bits,
    // max digit bits should be 26 because
    // max internal value = 2*dvalue^2-2*dvalue (< 2^53)
    function am1(i,x,w,j,c,n) {
      while(--n >= 0) {
        var v = x*this[i++]+w[j]+c;
        c = Math.floor(v/0x4000000);
        w[j++] = v&0x3ffffff;
      }
      return c;
    }
    // am2 avoids a big mult-and-extract completely.
    // Max digit bits should be <= 30 because we do bitwise ops
    // on values up to 2*hdvalue^2-hdvalue-1 (< 2^31)
    function am2(i,x,w,j,c,n) {
      var xl = x&0x7fff, xh = x>>15;
      while(--n >= 0) {
        var l = this[i]&0x7fff;
        var h = this[i++]>>15;
        var m = xh*l+h*xl;
        l = xl*l+((m&0x7fff)<<15)+w[j]+(c&0x3fffffff);
        c = (l>>>30)+(m>>>15)+xh*h+(c>>>30);
        w[j++] = l&0x3fffffff;
      }
      return c;
    }
    // Alternately, set max digit bits to 28 since some
    // browsers slow down when dealing with 32-bit numbers.
    function am3(i,x,w,j,c,n) {
      var xl = x&0x3fff, xh = x>>14;
      while(--n >= 0) {
        var l = this[i]&0x3fff;
        var h = this[i++]>>14;
        var m = xh*l+h*xl;
        l = xl*l+((m&0x3fff)<<14)+w[j]+c;
        c = (l>>28)+(m>>14)+xh*h;
        w[j++] = l&0xfffffff;
      }
      return c;
    }
    var inBrowser = typeof navigator !== "undefined";
    if(inBrowser && j_lm && (navigator.appName == "Microsoft Internet Explorer")) {
      BigInteger.prototype.am = am2;
      dbits = 30;
    }
    else if(inBrowser && j_lm && (navigator.appName != "Netscape")) {
      BigInteger.prototype.am = am1;
      dbits = 26;
    }
    else { // Mozilla/Netscape seems to prefer am3
      BigInteger.prototype.am = am3;
      dbits = 28;
    }

    BigInteger.prototype.DB = dbits;
    BigInteger.prototype.DM = ((1<<dbits)-1);
    BigInteger.prototype.DV = (1<<dbits);

    var BI_FP = 52;
    BigInteger.prototype.FV = Math.pow(2,BI_FP);
    BigInteger.prototype.F1 = BI_FP-dbits;
    BigInteger.prototype.F2 = 2*dbits-BI_FP;

    // Digit conversions
    var BI_RM = "0123456789abcdefghijklmnopqrstuvwxyz";
    var BI_RC = new Array();
    var rr,vv;
    rr = "0".charCodeAt(0);
    for(vv = 0; vv <= 9; ++vv) BI_RC[rr++] = vv;
    rr = "a".charCodeAt(0);
    for(vv = 10; vv < 36; ++vv) BI_RC[rr++] = vv;
    rr = "A".charCodeAt(0);
    for(vv = 10; vv < 36; ++vv) BI_RC[rr++] = vv;

    function int2char(n) { return BI_RM.charAt(n); }
    function intAt(s,i) {
      var c = BI_RC[s.charCodeAt(i)];
      return (c==null)?-1:c;
    }

    // (protected) copy this to r
    function bnpCopyTo(r) {
      for(var i = this.t-1; i >= 0; --i) r[i] = this[i];
      r.t = this.t;
      r.s = this.s;
    }

    // (protected) set from integer value x, -DV <= x < DV
    function bnpFromInt(x) {
      this.t = 1;
      this.s = (x<0)?-1:0;
      if(x > 0) this[0] = x;
      else if(x < -1) this[0] = x+DV;
      else this.t = 0;
    }

    // return bigint initialized to value
    function nbv(i) { var r = nbi(); r.fromInt(i); return r; }

    // (protected) set from string and radix
    function bnpFromString(s,b) {
      var k;
      if(b == 16) k = 4;
      else if(b == 8) k = 3;
      else if(b == 256) k = 8; // byte array
      else if(b == 2) k = 1;
      else if(b == 32) k = 5;
      else if(b == 4) k = 2;
      else { this.fromRadix(s,b); return; }
      this.t = 0;
      this.s = 0;
      var i = s.length, mi = false, sh = 0;
      while(--i >= 0) {
        var x = (k==8)?s[i]&0xff:intAt(s,i);
        if(x < 0) {
          if(s.charAt(i) == "-") mi = true;
          continue;
        }
        mi = false;
        if(sh == 0)
          this[this.t++] = x;
        else if(sh+k > this.DB) {
          this[this.t-1] |= (x&((1<<(this.DB-sh))-1))<<sh;
          this[this.t++] = (x>>(this.DB-sh));
        }
        else
          this[this.t-1] |= x<<sh;
        sh += k;
        if(sh >= this.DB) sh -= this.DB;
      }
      if(k == 8 && (s[0]&0x80) != 0) {
        this.s = -1;
        if(sh > 0) this[this.t-1] |= ((1<<(this.DB-sh))-1)<<sh;
      }
      this.clamp();
      if(mi) BigInteger.ZERO.subTo(this,this);
    }

    // (protected) clamp off excess high words
    function bnpClamp() {
      var c = this.s&this.DM;
      while(this.t > 0 && this[this.t-1] == c) --this.t;
    }

    // (public) return string representation in given radix
    function bnToString(b) {
      if(this.s < 0) return "-"+this.negate().toString(b);
      var k;
      if(b == 16) k = 4;
      else if(b == 8) k = 3;
      else if(b == 2) k = 1;
      else if(b == 32) k = 5;
      else if(b == 4) k = 2;
      else return this.toRadix(b);
      var km = (1<<k)-1, d, m = false, r = "", i = this.t;
      var p = this.DB-(i*this.DB)%k;
      if(i-- > 0) {
        if(p < this.DB && (d = this[i]>>p) > 0) { m = true; r = int2char(d); }
        while(i >= 0) {
          if(p < k) {
            d = (this[i]&((1<<p)-1))<<(k-p);
            d |= this[--i]>>(p+=this.DB-k);
          }
          else {
            d = (this[i]>>(p-=k))&km;
            if(p <= 0) { p += this.DB; --i; }
          }
          if(d > 0) m = true;
          if(m) r += int2char(d);
        }
      }
      return m?r:"0";
    }

    // (public) -this
    function bnNegate() { var r = nbi(); BigInteger.ZERO.subTo(this,r); return r; }

    // (public) |this|
    function bnAbs() { return (this.s<0)?this.negate():this; }

    // (public) return + if this > a, - if this < a, 0 if equal
    function bnCompareTo(a) {
      var r = this.s-a.s;
      if(r != 0) return r;
      var i = this.t;
      r = i-a.t;
      if(r != 0) return (this.s<0)?-r:r;
      while(--i >= 0) if((r=this[i]-a[i]) != 0) return r;
      return 0;
    }

    // returns bit length of the integer x
    function nbits(x) {
      var r = 1, t;
      if((t=x>>>16) != 0) { x = t; r += 16; }
      if((t=x>>8) != 0) { x = t; r += 8; }
      if((t=x>>4) != 0) { x = t; r += 4; }
      if((t=x>>2) != 0) { x = t; r += 2; }
      if((t=x>>1) != 0) { x = t; r += 1; }
      return r;
    }

    // (public) return the number of bits in "this"
    function bnBitLength() {
      if(this.t <= 0) return 0;
      return this.DB*(this.t-1)+nbits(this[this.t-1]^(this.s&this.DM));
    }

    // (protected) r = this << n*DB
    function bnpDLShiftTo(n,r) {
      var i;
      for(i = this.t-1; i >= 0; --i) r[i+n] = this[i];
      for(i = n-1; i >= 0; --i) r[i] = 0;
      r.t = this.t+n;
      r.s = this.s;
    }

    // (protected) r = this >> n*DB
    function bnpDRShiftTo(n,r) {
      for(var i = n; i < this.t; ++i) r[i-n] = this[i];
      r.t = Math.max(this.t-n,0);
      r.s = this.s;
    }

    // (protected) r = this << n
    function bnpLShiftTo(n,r) {
      var bs = n%this.DB;
      var cbs = this.DB-bs;
      var bm = (1<<cbs)-1;
      var ds = Math.floor(n/this.DB), c = (this.s<<bs)&this.DM, i;
      for(i = this.t-1; i >= 0; --i) {
        r[i+ds+1] = (this[i]>>cbs)|c;
        c = (this[i]&bm)<<bs;
      }
      for(i = ds-1; i >= 0; --i) r[i] = 0;
      r[ds] = c;
      r.t = this.t+ds+1;
      r.s = this.s;
      r.clamp();
    }

    // (protected) r = this >> n
    function bnpRShiftTo(n,r) {
      r.s = this.s;
      var ds = Math.floor(n/this.DB);
      if(ds >= this.t) { r.t = 0; return; }
      var bs = n%this.DB;
      var cbs = this.DB-bs;
      var bm = (1<<bs)-1;
      r[0] = this[ds]>>bs;
      for(var i = ds+1; i < this.t; ++i) {
        r[i-ds-1] |= (this[i]&bm)<<cbs;
        r[i-ds] = this[i]>>bs;
      }
      if(bs > 0) r[this.t-ds-1] |= (this.s&bm)<<cbs;
      r.t = this.t-ds;
      r.clamp();
    }

    // (protected) r = this - a
    function bnpSubTo(a,r) {
      var i = 0, c = 0, m = Math.min(a.t,this.t);
      while(i < m) {
        c += this[i]-a[i];
        r[i++] = c&this.DM;
        c >>= this.DB;
      }
      if(a.t < this.t) {
        c -= a.s;
        while(i < this.t) {
          c += this[i];
          r[i++] = c&this.DM;
          c >>= this.DB;
        }
        c += this.s;
      }
      else {
        c += this.s;
        while(i < a.t) {
          c -= a[i];
          r[i++] = c&this.DM;
          c >>= this.DB;
        }
        c -= a.s;
      }
      r.s = (c<0)?-1:0;
      if(c < -1) r[i++] = this.DV+c;
      else if(c > 0) r[i++] = c;
      r.t = i;
      r.clamp();
    }

    // (protected) r = this * a, r != this,a (HAC 14.12)
    // "this" should be the larger one if appropriate.
    function bnpMultiplyTo(a,r) {
      var x = this.abs(), y = a.abs();
      var i = x.t;
      r.t = i+y.t;
      while(--i >= 0) r[i] = 0;
      for(i = 0; i < y.t; ++i) r[i+x.t] = x.am(0,y[i],r,i,0,x.t);
      r.s = 0;
      r.clamp();
      if(this.s != a.s) BigInteger.ZERO.subTo(r,r);
    }

    // (protected) r = this^2, r != this (HAC 14.16)
    function bnpSquareTo(r) {
      var x = this.abs();
      var i = r.t = 2*x.t;
      while(--i >= 0) r[i] = 0;
      for(i = 0; i < x.t-1; ++i) {
        var c = x.am(i,x[i],r,2*i,0,1);
        if((r[i+x.t]+=x.am(i+1,2*x[i],r,2*i+1,c,x.t-i-1)) >= x.DV) {
          r[i+x.t] -= x.DV;
          r[i+x.t+1] = 1;
        }
      }
      if(r.t > 0) r[r.t-1] += x.am(i,x[i],r,2*i,0,1);
      r.s = 0;
      r.clamp();
    }

    // (protected) divide this by m, quotient and remainder to q, r (HAC 14.20)
    // r != q, this != m.  q or r may be null.
    function bnpDivRemTo(m,q,r) {
      var pm = m.abs();
      if(pm.t <= 0) return;
      var pt = this.abs();
      if(pt.t < pm.t) {
        if(q != null) q.fromInt(0);
        if(r != null) this.copyTo(r);
        return;
      }
      if(r == null) r = nbi();
      var y = nbi(), ts = this.s, ms = m.s;
      var nsh = this.DB-nbits(pm[pm.t-1]);   // normalize modulus
      if(nsh > 0) { pm.lShiftTo(nsh,y); pt.lShiftTo(nsh,r); }
      else { pm.copyTo(y); pt.copyTo(r); }
      var ys = y.t;
      var y0 = y[ys-1];
      if(y0 == 0) return;
      var yt = y0*(1<<this.F1)+((ys>1)?y[ys-2]>>this.F2:0);
      var d1 = this.FV/yt, d2 = (1<<this.F1)/yt, e = 1<<this.F2;
      var i = r.t, j = i-ys, t = (q==null)?nbi():q;
      y.dlShiftTo(j,t);
      if(r.compareTo(t) >= 0) {
        r[r.t++] = 1;
        r.subTo(t,r);
      }
      BigInteger.ONE.dlShiftTo(ys,t);
      t.subTo(y,y);  // "negative" y so we can replace sub with am later
      while(y.t < ys) y[y.t++] = 0;
      while(--j >= 0) {
        // Estimate quotient digit
        var qd = (r[--i]==y0)?this.DM:Math.floor(r[i]*d1+(r[i-1]+e)*d2);
        if((r[i]+=y.am(0,qd,r,j,0,ys)) < qd) {   // Try it out
          y.dlShiftTo(j,t);
          r.subTo(t,r);
          while(r[i] < --qd) r.subTo(t,r);
        }
      }
      if(q != null) {
        r.drShiftTo(ys,q);
        if(ts != ms) BigInteger.ZERO.subTo(q,q);
      }
      r.t = ys;
      r.clamp();
      if(nsh > 0) r.rShiftTo(nsh,r); // Denormalize remainder
      if(ts < 0) BigInteger.ZERO.subTo(r,r);
    }

    // (public) this mod a
    function bnMod(a) {
      var r = nbi();
      this.abs().divRemTo(a,null,r);
      if(this.s < 0 && r.compareTo(BigInteger.ZERO) > 0) a.subTo(r,r);
      return r;
    }

    // Modular reduction using "classic" algorithm
    function Classic(m) { this.m = m; }
    function cConvert(x) {
      if(x.s < 0 || x.compareTo(this.m) >= 0) return x.mod(this.m);
      else return x;
    }
    function cRevert(x) { return x; }
    function cReduce(x) { x.divRemTo(this.m,null,x); }
    function cMulTo(x,y,r) { x.multiplyTo(y,r); this.reduce(r); }
    function cSqrTo(x,r) { x.squareTo(r); this.reduce(r); }

    Classic.prototype.convert = cConvert;
    Classic.prototype.revert = cRevert;
    Classic.prototype.reduce = cReduce;
    Classic.prototype.mulTo = cMulTo;
    Classic.prototype.sqrTo = cSqrTo;

    // (protected) return "-1/this % 2^DB"; useful for Mont. reduction
    // justification:
    //         xy == 1 (mod m)
    //         xy =  1+km
    //   xy(2-xy) = (1+km)(1-km)
    // x[y(2-xy)] = 1-k^2m^2
    // x[y(2-xy)] == 1 (mod m^2)
    // if y is 1/x mod m, then y(2-xy) is 1/x mod m^2
    // should reduce x and y(2-xy) by m^2 at each step to keep size bounded.
    // JS multiply "overflows" differently from C/C++, so care is needed here.
    function bnpInvDigit() {
      if(this.t < 1) return 0;
      var x = this[0];
      if((x&1) == 0) return 0;
      var y = x&3;       // y == 1/x mod 2^2
      y = (y*(2-(x&0xf)*y))&0xf; // y == 1/x mod 2^4
      y = (y*(2-(x&0xff)*y))&0xff;   // y == 1/x mod 2^8
      y = (y*(2-(((x&0xffff)*y)&0xffff)))&0xffff;    // y == 1/x mod 2^16
      // last step - calculate inverse mod DV directly;
      // assumes 16 < DB <= 32 and assumes ability to handle 48-bit ints
      y = (y*(2-x*y%this.DV))%this.DV;       // y == 1/x mod 2^dbits
      // we really want the negative inverse, and -DV < y < DV
      return (y>0)?this.DV-y:-y;
    }

    // Montgomery reduction
    function Montgomery(m) {
      this.m = m;
      this.mp = m.invDigit();
      this.mpl = this.mp&0x7fff;
      this.mph = this.mp>>15;
      this.um = (1<<(m.DB-15))-1;
      this.mt2 = 2*m.t;
    }

    // xR mod m
    function montConvert(x) {
      var r = nbi();
      x.abs().dlShiftTo(this.m.t,r);
      r.divRemTo(this.m,null,r);
      if(x.s < 0 && r.compareTo(BigInteger.ZERO) > 0) this.m.subTo(r,r);
      return r;
    }

    // x/R mod m
    function montRevert(x) {
      var r = nbi();
      x.copyTo(r);
      this.reduce(r);
      return r;
    }

    // x = x/R mod m (HAC 14.32)
    function montReduce(x) {
      while(x.t <= this.mt2) // pad x so am has enough room later
        x[x.t++] = 0;
      for(var i = 0; i < this.m.t; ++i) {
        // faster way of calculating u0 = x[i]*mp mod DV
        var j = x[i]&0x7fff;
        var u0 = (j*this.mpl+(((j*this.mph+(x[i]>>15)*this.mpl)&this.um)<<15))&x.DM;
        // use am to combine the multiply-shift-add into one call
        j = i+this.m.t;
        x[j] += this.m.am(0,u0,x,i,0,this.m.t);
        // propagate carry
        while(x[j] >= x.DV) { x[j] -= x.DV; x[++j]++; }
      }
      x.clamp();
      x.drShiftTo(this.m.t,x);
      if(x.compareTo(this.m) >= 0) x.subTo(this.m,x);
    }

    // r = "x^2/R mod m"; x != r
    function montSqrTo(x,r) { x.squareTo(r); this.reduce(r); }

    // r = "xy/R mod m"; x,y != r
    function montMulTo(x,y,r) { x.multiplyTo(y,r); this.reduce(r); }

    Montgomery.prototype.convert = montConvert;
    Montgomery.prototype.revert = montRevert;
    Montgomery.prototype.reduce = montReduce;
    Montgomery.prototype.mulTo = montMulTo;
    Montgomery.prototype.sqrTo = montSqrTo;

    // (protected) true iff this is even
    function bnpIsEven() { return ((this.t>0)?(this[0]&1):this.s) == 0; }

    // (protected) this^e, e < 2^32, doing sqr and mul with "r" (HAC 14.79)
    function bnpExp(e,z) {
      if(e > 0xffffffff || e < 1) return BigInteger.ONE;
      var r = nbi(), r2 = nbi(), g = z.convert(this), i = nbits(e)-1;
      g.copyTo(r);
      while(--i >= 0) {
        z.sqrTo(r,r2);
        if((e&(1<<i)) > 0) z.mulTo(r2,g,r);
        else { var t = r; r = r2; r2 = t; }
      }
      return z.revert(r);
    }

    // (public) this^e % m, 0 <= e < 2^32
    function bnModPowInt(e,m) {
      var z;
      if(e < 256 || m.isEven()) z = new Classic(m); else z = new Montgomery(m);
      return this.exp(e,z);
    }

    // protected
    BigInteger.prototype.copyTo = bnpCopyTo;
    BigInteger.prototype.fromInt = bnpFromInt;
    BigInteger.prototype.fromString = bnpFromString;
    BigInteger.prototype.clamp = bnpClamp;
    BigInteger.prototype.dlShiftTo = bnpDLShiftTo;
    BigInteger.prototype.drShiftTo = bnpDRShiftTo;
    BigInteger.prototype.lShiftTo = bnpLShiftTo;
    BigInteger.prototype.rShiftTo = bnpRShiftTo;
    BigInteger.prototype.subTo = bnpSubTo;
    BigInteger.prototype.multiplyTo = bnpMultiplyTo;
    BigInteger.prototype.squareTo = bnpSquareTo;
    BigInteger.prototype.divRemTo = bnpDivRemTo;
    BigInteger.prototype.invDigit = bnpInvDigit;
    BigInteger.prototype.isEven = bnpIsEven;
    BigInteger.prototype.exp = bnpExp;

    // public
    BigInteger.prototype.toString = bnToString;
    BigInteger.prototype.negate = bnNegate;
    BigInteger.prototype.abs = bnAbs;
    BigInteger.prototype.compareTo = bnCompareTo;
    BigInteger.prototype.bitLength = bnBitLength;
    BigInteger.prototype.mod = bnMod;
    BigInteger.prototype.modPowInt = bnModPowInt;

    // "constants"
    BigInteger.ZERO = nbv(0);
    BigInteger.ONE = nbv(1);

    // Copyright (c) 2005-2009  Tom Wu
    // All Rights Reserved.
    // See "LICENSE" for details.

    // Extended JavaScript BN functions, required for RSA private ops.

    // Version 1.1: new BigInteger("0", 10) returns "proper" zero
    // Version 1.2: square() API, isProbablePrime fix

    // (public)
    function bnClone() { var r = nbi(); this.copyTo(r); return r; }

    // (public) return value as integer
    function bnIntValue() {
      if(this.s < 0) {
        if(this.t == 1) return this[0]-this.DV;
        else if(this.t == 0) return -1;
      }
      else if(this.t == 1) return this[0];
      else if(this.t == 0) return 0;
      // assumes 16 < DB < 32
      return ((this[1]&((1<<(32-this.DB))-1))<<this.DB)|this[0];
    }

    // (public) return value as byte
    function bnByteValue() { return (this.t==0)?this.s:(this[0]<<24)>>24; }

    // (public) return value as short (assumes DB>=16)
    function bnShortValue() { return (this.t==0)?this.s:(this[0]<<16)>>16; }

    // (protected) return x s.t. r^x < DV
    function bnpChunkSize(r) { return Math.floor(Math.LN2*this.DB/Math.log(r)); }

    // (public) 0 if this == 0, 1 if this > 0
    function bnSigNum() {
      if(this.s < 0) return -1;
      else if(this.t <= 0 || (this.t == 1 && this[0] <= 0)) return 0;
      else return 1;
    }

    // (protected) convert to radix string
    function bnpToRadix(b) {
      if(b == null) b = 10;
      if(this.signum() == 0 || b < 2 || b > 36) return "0";
      var cs = this.chunkSize(b);
      var a = Math.pow(b,cs);
      var d = nbv(a), y = nbi(), z = nbi(), r = "";
      this.divRemTo(d,y,z);
      while(y.signum() > 0) {
        r = (a+z.intValue()).toString(b).substr(1) + r;
        y.divRemTo(d,y,z);
      }
      return z.intValue().toString(b) + r;
    }

    // (protected) convert from radix string
    function bnpFromRadix(s,b) {
      this.fromInt(0);
      if(b == null) b = 10;
      var cs = this.chunkSize(b);
      var d = Math.pow(b,cs), mi = false, j = 0, w = 0;
      for(var i = 0; i < s.length; ++i) {
        var x = intAt(s,i);
        if(x < 0) {
          if(s.charAt(i) == "-" && this.signum() == 0) mi = true;
          continue;
        }
        w = b*w+x;
        if(++j >= cs) {
          this.dMultiply(d);
          this.dAddOffset(w,0);
          j = 0;
          w = 0;
        }
      }
      if(j > 0) {
        this.dMultiply(Math.pow(b,j));
        this.dAddOffset(w,0);
      }
      if(mi) BigInteger.ZERO.subTo(this,this);
    }

    // (protected) alternate constructor
    function bnpFromNumber(a,b,c) {
      if("number" == typeof b) {
        // new BigInteger(int,int,RNG)
        if(a < 2) this.fromInt(1);
        else {
          this.fromNumber(a,c);
          if(!this.testBit(a-1))	// force MSB set
            this.bitwiseTo(BigInteger.ONE.shiftLeft(a-1),op_or,this);
          if(this.isEven()) this.dAddOffset(1,0); // force odd
          while(!this.isProbablePrime(b)) {
            this.dAddOffset(2,0);
            if(this.bitLength() > a) this.subTo(BigInteger.ONE.shiftLeft(a-1),this);
          }
        }
      }
      else {
        // new BigInteger(int,RNG)
        var x = new Array(), t = a&7;
        x.length = (a>>3)+1;
        b.nextBytes(x);
        if(t > 0) x[0] &= ((1<<t)-1); else x[0] = 0;
        this.fromString(x,256);
      }
    }

    // (public) convert to bigendian byte array
    function bnToByteArray() {
      var i = this.t, r = new Array();
      r[0] = this.s;
      var p = this.DB-(i*this.DB)%8, d, k = 0;
      if(i-- > 0) {
        if(p < this.DB && (d = this[i]>>p) != (this.s&this.DM)>>p)
          r[k++] = d|(this.s<<(this.DB-p));
        while(i >= 0) {
          if(p < 8) {
            d = (this[i]&((1<<p)-1))<<(8-p);
            d |= this[--i]>>(p+=this.DB-8);
          }
          else {
            d = (this[i]>>(p-=8))&0xff;
            if(p <= 0) { p += this.DB; --i; }
          }
          if((d&0x80) != 0) d |= -256;
          if(k == 0 && (this.s&0x80) != (d&0x80)) ++k;
          if(k > 0 || d != this.s) r[k++] = d;
        }
      }
      return r;
    }

    function bnEquals(a) { return(this.compareTo(a)==0); }
    function bnMin(a) { return(this.compareTo(a)<0)?this:a; }
    function bnMax(a) { return(this.compareTo(a)>0)?this:a; }

    // (protected) r = this op a (bitwise)
    function bnpBitwiseTo(a,op,r) {
      var i, f, m = Math.min(a.t,this.t);
      for(i = 0; i < m; ++i) r[i] = op(this[i],a[i]);
      if(a.t < this.t) {
        f = a.s&this.DM;
        for(i = m; i < this.t; ++i) r[i] = op(this[i],f);
        r.t = this.t;
      }
      else {
        f = this.s&this.DM;
        for(i = m; i < a.t; ++i) r[i] = op(f,a[i]);
        r.t = a.t;
      }
      r.s = op(this.s,a.s);
      r.clamp();
    }

    // (public) this & a
    function op_and(x,y) { return x&y; }
    function bnAnd(a) { var r = nbi(); this.bitwiseTo(a,op_and,r); return r; }

    // (public) this | a
    function op_or(x,y) { return x|y; }
    function bnOr(a) { var r = nbi(); this.bitwiseTo(a,op_or,r); return r; }

    // (public) this ^ a
    function op_xor(x,y) { return x^y; }
    function bnXor(a) { var r = nbi(); this.bitwiseTo(a,op_xor,r); return r; }

    // (public) this & ~a
    function op_andnot(x,y) { return x&~y; }
    function bnAndNot(a) { var r = nbi(); this.bitwiseTo(a,op_andnot,r); return r; }

    // (public) ~this
    function bnNot() {
      var r = nbi();
      for(var i = 0; i < this.t; ++i) r[i] = this.DM&~this[i];
      r.t = this.t;
      r.s = ~this.s;
      return r;
    }

    // (public) this << n
    function bnShiftLeft(n) {
      var r = nbi();
      if(n < 0) this.rShiftTo(-n,r); else this.lShiftTo(n,r);
      return r;
    }

    // (public) this >> n
    function bnShiftRight(n) {
      var r = nbi();
      if(n < 0) this.lShiftTo(-n,r); else this.rShiftTo(n,r);
      return r;
    }

    // return index of lowest 1-bit in x, x < 2^31
    function lbit(x) {
      if(x == 0) return -1;
      var r = 0;
      if((x&0xffff) == 0) { x >>= 16; r += 16; }
      if((x&0xff) == 0) { x >>= 8; r += 8; }
      if((x&0xf) == 0) { x >>= 4; r += 4; }
      if((x&3) == 0) { x >>= 2; r += 2; }
      if((x&1) == 0) ++r;
      return r;
    }

    // (public) returns index of lowest 1-bit (or -1 if none)
    function bnGetLowestSetBit() {
      for(var i = 0; i < this.t; ++i)
        if(this[i] != 0) return i*this.DB+lbit(this[i]);
      if(this.s < 0) return this.t*this.DB;
      return -1;
    }

    // return number of 1 bits in x
    function cbit(x) {
      var r = 0;
      while(x != 0) { x &= x-1; ++r; }
      return r;
    }

    // (public) return number of set bits
    function bnBitCount() {
      var r = 0, x = this.s&this.DM;
      for(var i = 0; i < this.t; ++i) r += cbit(this[i]^x);
      return r;
    }

    // (public) true iff nth bit is set
    function bnTestBit(n) {
      var j = Math.floor(n/this.DB);
      if(j >= this.t) return(this.s!=0);
      return((this[j]&(1<<(n%this.DB)))!=0);
    }

    // (protected) this op (1<<n)
    function bnpChangeBit(n,op) {
      var r = BigInteger.ONE.shiftLeft(n);
      this.bitwiseTo(r,op,r);
      return r;
    }

    // (public) this | (1<<n)
    function bnSetBit(n) { return this.changeBit(n,op_or); }

    // (public) this & ~(1<<n)
    function bnClearBit(n) { return this.changeBit(n,op_andnot); }

    // (public) this ^ (1<<n)
    function bnFlipBit(n) { return this.changeBit(n,op_xor); }

    // (protected) r = this + a
    function bnpAddTo(a,r) {
      var i = 0, c = 0, m = Math.min(a.t,this.t);
      while(i < m) {
        c += this[i]+a[i];
        r[i++] = c&this.DM;
        c >>= this.DB;
      }
      if(a.t < this.t) {
        c += a.s;
        while(i < this.t) {
          c += this[i];
          r[i++] = c&this.DM;
          c >>= this.DB;
        }
        c += this.s;
      }
      else {
        c += this.s;
        while(i < a.t) {
          c += a[i];
          r[i++] = c&this.DM;
          c >>= this.DB;
        }
        c += a.s;
      }
      r.s = (c<0)?-1:0;
      if(c > 0) r[i++] = c;
      else if(c < -1) r[i++] = this.DV+c;
      r.t = i;
      r.clamp();
    }

    // (public) this + a
    function bnAdd(a) { var r = nbi(); this.addTo(a,r); return r; }

    // (public) this - a
    function bnSubtract(a) { var r = nbi(); this.subTo(a,r); return r; }

    // (public) this * a
    function bnMultiply(a) { var r = nbi(); this.multiplyTo(a,r); return r; }

    // (public) this^2
    function bnSquare() { var r = nbi(); this.squareTo(r); return r; }

    // (public) this / a
    function bnDivide(a) { var r = nbi(); this.divRemTo(a,r,null); return r; }

    // (public) this % a
    function bnRemainder(a) { var r = nbi(); this.divRemTo(a,null,r); return r; }

    // (public) [this/a,this%a]
    function bnDivideAndRemainder(a) {
      var q = nbi(), r = nbi();
      this.divRemTo(a,q,r);
      return new Array(q,r);
    }

    // (protected) this *= n, this >= 0, 1 < n < DV
    function bnpDMultiply(n) {
      this[this.t] = this.am(0,n-1,this,0,0,this.t);
      ++this.t;
      this.clamp();
    }

    // (protected) this += n << w words, this >= 0
    function bnpDAddOffset(n,w) {
      if(n == 0) return;
      while(this.t <= w) this[this.t++] = 0;
      this[w] += n;
      while(this[w] >= this.DV) {
        this[w] -= this.DV;
        if(++w >= this.t) this[this.t++] = 0;
        ++this[w];
      }
    }

    // A "null" reducer
    function NullExp() {}
    function nNop(x) { return x; }
    function nMulTo(x,y,r) { x.multiplyTo(y,r); }
    function nSqrTo(x,r) { x.squareTo(r); }

    NullExp.prototype.convert = nNop;
    NullExp.prototype.revert = nNop;
    NullExp.prototype.mulTo = nMulTo;
    NullExp.prototype.sqrTo = nSqrTo;

    // (public) this^e
    function bnPow(e) { return this.exp(e,new NullExp()); }

    // (protected) r = lower n words of "this * a", a.t <= n
    // "this" should be the larger one if appropriate.
    function bnpMultiplyLowerTo(a,n,r) {
      var i = Math.min(this.t+a.t,n);
      r.s = 0; // assumes a,this >= 0
      r.t = i;
      while(i > 0) r[--i] = 0;
      var j;
      for(j = r.t-this.t; i < j; ++i) r[i+this.t] = this.am(0,a[i],r,i,0,this.t);
      for(j = Math.min(a.t,n); i < j; ++i) this.am(0,a[i],r,i,0,n-i);
      r.clamp();
    }

    // (protected) r = "this * a" without lower n words, n > 0
    // "this" should be the larger one if appropriate.
    function bnpMultiplyUpperTo(a,n,r) {
      --n;
      var i = r.t = this.t+a.t-n;
      r.s = 0; // assumes a,this >= 0
      while(--i >= 0) r[i] = 0;
      for(i = Math.max(n-this.t,0); i < a.t; ++i)
        r[this.t+i-n] = this.am(n-i,a[i],r,0,0,this.t+i-n);
      r.clamp();
      r.drShiftTo(1,r);
    }

    // Barrett modular reduction
    function Barrett(m) {
      // setup Barrett
      this.r2 = nbi();
      this.q3 = nbi();
      BigInteger.ONE.dlShiftTo(2*m.t,this.r2);
      this.mu = this.r2.divide(m);
      this.m = m;
    }

    function barrettConvert(x) {
      if(x.s < 0 || x.t > 2*this.m.t) return x.mod(this.m);
      else if(x.compareTo(this.m) < 0) return x;
      else { var r = nbi(); x.copyTo(r); this.reduce(r); return r; }
    }

    function barrettRevert(x) { return x; }

    // x = x mod m (HAC 14.42)
    function barrettReduce(x) {
      x.drShiftTo(this.m.t-1,this.r2);
      if(x.t > this.m.t+1) { x.t = this.m.t+1; x.clamp(); }
      this.mu.multiplyUpperTo(this.r2,this.m.t+1,this.q3);
      this.m.multiplyLowerTo(this.q3,this.m.t+1,this.r2);
      while(x.compareTo(this.r2) < 0) x.dAddOffset(1,this.m.t+1);
      x.subTo(this.r2,x);
      while(x.compareTo(this.m) >= 0) x.subTo(this.m,x);
    }

    // r = x^2 mod m; x != r
    function barrettSqrTo(x,r) { x.squareTo(r); this.reduce(r); }

    // r = x*y mod m; x,y != r
    function barrettMulTo(x,y,r) { x.multiplyTo(y,r); this.reduce(r); }

    Barrett.prototype.convert = barrettConvert;
    Barrett.prototype.revert = barrettRevert;
    Barrett.prototype.reduce = barrettReduce;
    Barrett.prototype.mulTo = barrettMulTo;
    Barrett.prototype.sqrTo = barrettSqrTo;

    // (public) this^e % m (HAC 14.85)
    function bnModPow(e,m) {
      var i = e.bitLength(), k, r = nbv(1), z;
      if(i <= 0) return r;
      else if(i < 18) k = 1;
      else if(i < 48) k = 3;
      else if(i < 144) k = 4;
      else if(i < 768) k = 5;
      else k = 6;
      if(i < 8)
        z = new Classic(m);
      else if(m.isEven())
        z = new Barrett(m);
      else
        z = new Montgomery(m);

      // precomputation
      var g = new Array(), n = 3, k1 = k-1, km = (1<<k)-1;
      g[1] = z.convert(this);
      if(k > 1) {
        var g2 = nbi();
        z.sqrTo(g[1],g2);
        while(n <= km) {
          g[n] = nbi();
          z.mulTo(g2,g[n-2],g[n]);
          n += 2;
        }
      }

      var j = e.t-1, w, is1 = true, r2 = nbi(), t;
      i = nbits(e[j])-1;
      while(j >= 0) {
        if(i >= k1) w = (e[j]>>(i-k1))&km;
        else {
          w = (e[j]&((1<<(i+1))-1))<<(k1-i);
          if(j > 0) w |= e[j-1]>>(this.DB+i-k1);
        }

        n = k;
        while((w&1) == 0) { w >>= 1; --n; }
        if((i -= n) < 0) { i += this.DB; --j; }
        if(is1) {	// ret == 1, don't bother squaring or multiplying it
          g[w].copyTo(r);
          is1 = false;
        }
        else {
          while(n > 1) { z.sqrTo(r,r2); z.sqrTo(r2,r); n -= 2; }
          if(n > 0) z.sqrTo(r,r2); else { t = r; r = r2; r2 = t; }
          z.mulTo(r2,g[w],r);
        }

        while(j >= 0 && (e[j]&(1<<i)) == 0) {
          z.sqrTo(r,r2); t = r; r = r2; r2 = t;
          if(--i < 0) { i = this.DB-1; --j; }
        }
      }
      return z.revert(r);
    }

    // (public) gcd(this,a) (HAC 14.54)
    function bnGCD(a) {
      var x = (this.s<0)?this.negate():this.clone();
      var y = (a.s<0)?a.negate():a.clone();
      if(x.compareTo(y) < 0) { var t = x; x = y; y = t; }
      var i = x.getLowestSetBit(), g = y.getLowestSetBit();
      if(g < 0) return x;
      if(i < g) g = i;
      if(g > 0) {
        x.rShiftTo(g,x);
        y.rShiftTo(g,y);
      }
      while(x.signum() > 0) {
        if((i = x.getLowestSetBit()) > 0) x.rShiftTo(i,x);
        if((i = y.getLowestSetBit()) > 0) y.rShiftTo(i,y);
        if(x.compareTo(y) >= 0) {
          x.subTo(y,x);
          x.rShiftTo(1,x);
        }
        else {
          y.subTo(x,y);
          y.rShiftTo(1,y);
        }
      }
      if(g > 0) y.lShiftTo(g,y);
      return y;
    }

    // (protected) this % n, n < 2^26
    function bnpModInt(n) {
      if(n <= 0) return 0;
      var d = this.DV%n, r = (this.s<0)?n-1:0;
      if(this.t > 0)
        if(d == 0) r = this[0]%n;
        else for(var i = this.t-1; i >= 0; --i) r = (d*r+this[i])%n;
      return r;
    }

    // (public) 1/this % m (HAC 14.61)
    function bnModInverse(m) {
      var ac = m.isEven();
      if((this.isEven() && ac) || m.signum() == 0) return BigInteger.ZERO;
      var u = m.clone(), v = this.clone();
      var a = nbv(1), b = nbv(0), c = nbv(0), d = nbv(1);
      while(u.signum() != 0) {
        while(u.isEven()) {
          u.rShiftTo(1,u);
          if(ac) {
            if(!a.isEven() || !b.isEven()) { a.addTo(this,a); b.subTo(m,b); }
            a.rShiftTo(1,a);
          }
          else if(!b.isEven()) b.subTo(m,b);
          b.rShiftTo(1,b);
        }
        while(v.isEven()) {
          v.rShiftTo(1,v);
          if(ac) {
            if(!c.isEven() || !d.isEven()) { c.addTo(this,c); d.subTo(m,d); }
            c.rShiftTo(1,c);
          }
          else if(!d.isEven()) d.subTo(m,d);
          d.rShiftTo(1,d);
        }
        if(u.compareTo(v) >= 0) {
          u.subTo(v,u);
          if(ac) a.subTo(c,a);
          b.subTo(d,b);
        }
        else {
          v.subTo(u,v);
          if(ac) c.subTo(a,c);
          d.subTo(b,d);
        }
      }
      if(v.compareTo(BigInteger.ONE) != 0) return BigInteger.ZERO;
      if(d.compareTo(m) >= 0) return d.subtract(m);
      if(d.signum() < 0) d.addTo(m,d); else return d;
      if(d.signum() < 0) return d.add(m); else return d;
    }

    var lowprimes = [2,3,5,7,11,13,17,19,23,29,31,37,41,43,47,53,59,61,67,71,73,79,83,89,97,101,103,107,109,113,127,131,137,139,149,151,157,163,167,173,179,181,191,193,197,199,211,223,227,229,233,239,241,251,257,263,269,271,277,281,283,293,307,311,313,317,331,337,347,349,353,359,367,373,379,383,389,397,401,409,419,421,431,433,439,443,449,457,461,463,467,479,487,491,499,503,509,521,523,541,547,557,563,569,571,577,587,593,599,601,607,613,617,619,631,641,643,647,653,659,661,673,677,683,691,701,709,719,727,733,739,743,751,757,761,769,773,787,797,809,811,821,823,827,829,839,853,857,859,863,877,881,883,887,907,911,919,929,937,941,947,953,967,971,977,983,991,997];
    var lplim = (1<<26)/lowprimes[lowprimes.length-1];

    // (public) test primality with certainty >= 1-.5^t
    function bnIsProbablePrime(t) {
      var i, x = this.abs();
      if(x.t == 1 && x[0] <= lowprimes[lowprimes.length-1]) {
        for(i = 0; i < lowprimes.length; ++i)
          if(x[0] == lowprimes[i]) return true;
        return false;
      }
      if(x.isEven()) return false;
      i = 1;
      while(i < lowprimes.length) {
        var m = lowprimes[i], j = i+1;
        while(j < lowprimes.length && m < lplim) m *= lowprimes[j++];
        m = x.modInt(m);
        while(i < j) if(m%lowprimes[i++] == 0) return false;
      }
      return x.millerRabin(t);
    }

    // (protected) true if probably prime (HAC 4.24, Miller-Rabin)
    function bnpMillerRabin(t) {
      var n1 = this.subtract(BigInteger.ONE);
      var k = n1.getLowestSetBit();
      if(k <= 0) return false;
      var r = n1.shiftRight(k);
      t = (t+1)>>1;
      if(t > lowprimes.length) t = lowprimes.length;
      var a = nbi();
      for(var i = 0; i < t; ++i) {
        //Pick bases at random, instead of starting at 2
        a.fromInt(lowprimes[Math.floor(Math.random()*lowprimes.length)]);
        var y = a.modPow(r,this);
        if(y.compareTo(BigInteger.ONE) != 0 && y.compareTo(n1) != 0) {
          var j = 1;
          while(j++ < k && y.compareTo(n1) != 0) {
            y = y.modPowInt(2,this);
            if(y.compareTo(BigInteger.ONE) == 0) return false;
          }
          if(y.compareTo(n1) != 0) return false;
        }
      }
      return true;
    }

    // protected
    BigInteger.prototype.chunkSize = bnpChunkSize;
    BigInteger.prototype.toRadix = bnpToRadix;
    BigInteger.prototype.fromRadix = bnpFromRadix;
    BigInteger.prototype.fromNumber = bnpFromNumber;
    BigInteger.prototype.bitwiseTo = bnpBitwiseTo;
    BigInteger.prototype.changeBit = bnpChangeBit;
    BigInteger.prototype.addTo = bnpAddTo;
    BigInteger.prototype.dMultiply = bnpDMultiply;
    BigInteger.prototype.dAddOffset = bnpDAddOffset;
    BigInteger.prototype.multiplyLowerTo = bnpMultiplyLowerTo;
    BigInteger.prototype.multiplyUpperTo = bnpMultiplyUpperTo;
    BigInteger.prototype.modInt = bnpModInt;
    BigInteger.prototype.millerRabin = bnpMillerRabin;

    // public
    BigInteger.prototype.clone = bnClone;
    BigInteger.prototype.intValue = bnIntValue;
    BigInteger.prototype.byteValue = bnByteValue;
    BigInteger.prototype.shortValue = bnShortValue;
    BigInteger.prototype.signum = bnSigNum;
    BigInteger.prototype.toByteArray = bnToByteArray;
    BigInteger.prototype.equals = bnEquals;
    BigInteger.prototype.min = bnMin;
    BigInteger.prototype.max = bnMax;
    BigInteger.prototype.and = bnAnd;
    BigInteger.prototype.or = bnOr;
    BigInteger.prototype.xor = bnXor;
    BigInteger.prototype.andNot = bnAndNot;
    BigInteger.prototype.not = bnNot;
    BigInteger.prototype.shiftLeft = bnShiftLeft;
    BigInteger.prototype.shiftRight = bnShiftRight;
    BigInteger.prototype.getLowestSetBit = bnGetLowestSetBit;
    BigInteger.prototype.bitCount = bnBitCount;
    BigInteger.prototype.testBit = bnTestBit;
    BigInteger.prototype.setBit = bnSetBit;
    BigInteger.prototype.clearBit = bnClearBit;
    BigInteger.prototype.flipBit = bnFlipBit;
    BigInteger.prototype.add = bnAdd;
    BigInteger.prototype.subtract = bnSubtract;
    BigInteger.prototype.multiply = bnMultiply;
    BigInteger.prototype.divide = bnDivide;
    BigInteger.prototype.remainder = bnRemainder;
    BigInteger.prototype.divideAndRemainder = bnDivideAndRemainder;
    BigInteger.prototype.modPow = bnModPow;
    BigInteger.prototype.modInverse = bnModInverse;
    BigInteger.prototype.pow = bnPow;
    BigInteger.prototype.gcd = bnGCD;
    BigInteger.prototype.isProbablePrime = bnIsProbablePrime;

    // JSBN-specific extension
    BigInteger.prototype.square = bnSquare;

    // BigInteger interfaces not implemented in jsbn:

    // BigInteger(int signum, byte[] magnitude)
    // double doubleValue()
    // float floatValue()
    // int hashCode()
    // long longValue()
    // static BigInteger valueOf(long val)
    if (typeof exports !== 'undefined') {
        exports = module.exports = BigInteger;
    } else {
        this.BigInteger = BigInteger;
    }
    
}).call(this);
},{}],85:[function(require,module,exports){
/*
 Copyright 2013 Daniel Wirtz <dcode@dcode.io>

 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.
 */

/**
 * @license ProtoBuf.js (c) 2013 Daniel Wirtz <dcode@dcode.io>
 * Released under the Apache License, Version 2.0
 * see: https://github.com/dcodeIO/ProtoBuf.js for details
 */
(function(global) {
    "use strict";

    function init(ByteBuffer) {

        /**
         * The ProtoBuf namespace.
         * @exports ProtoBuf
         * @namespace
         * @expose
         */
        var ProtoBuf = {};

        /**
         * ProtoBuf.js version.
         * @type {string}
         * @const
         * @expose
         */
        ProtoBuf.VERSION = "3.2.2";

        /**
         * Wire types.
         * @type {Object.<string,number>}
         * @const
         * @expose
         */
        ProtoBuf.WIRE_TYPES = {};

        /**
         * Varint wire type.
         * @type {number}
         * @expose
         */
        ProtoBuf.WIRE_TYPES.VARINT = 0;

        /**
         * Fixed 64 bits wire type.
         * @type {number}
         * @const
         * @expose
         */
        ProtoBuf.WIRE_TYPES.BITS64 = 1;

        /**
         * Length delimited wire type.
         * @type {number}
         * @const
         * @expose
         */
        ProtoBuf.WIRE_TYPES.LDELIM = 2;

        /**
         * Start group wire type.
         * @type {number}
         * @const
         * @expose
         */
        ProtoBuf.WIRE_TYPES.STARTGROUP = 3;

        /**
         * End group wire type.
         * @type {number}
         * @const
         * @expose
         */
        ProtoBuf.WIRE_TYPES.ENDGROUP = 4;

        /**
         * Fixed 32 bits wire type.
         * @type {number}
         * @const
         * @expose
         */
        ProtoBuf.WIRE_TYPES.BITS32 = 5;

        /**
         * Packable wire types.
         * @type {!Array.<number>}
         * @const
         * @expose
         */
        ProtoBuf.PACKABLE_WIRE_TYPES = [
            ProtoBuf.WIRE_TYPES.VARINT,
            ProtoBuf.WIRE_TYPES.BITS64,
            ProtoBuf.WIRE_TYPES.BITS32
        ];

        /**
         * Types.
         * @dict
         * @type {Object.<string,{name: string, wireType: number}>}
         * @const
         * @expose
         */
        ProtoBuf.TYPES = {
            // According to the protobuf spec.
            "int32": {
                name: "int32",
                wireType: ProtoBuf.WIRE_TYPES.VARINT
            },
            "uint32": {
                name: "uint32",
                wireType: ProtoBuf.WIRE_TYPES.VARINT
            },
            "sint32": {
                name: "sint32",
                wireType: ProtoBuf.WIRE_TYPES.VARINT
            },
            "int64": {
                name: "int64",
                wireType: ProtoBuf.WIRE_TYPES.VARINT
            },
            "uint64": {
                name: "uint64",
                wireType: ProtoBuf.WIRE_TYPES.VARINT
            },
            "sint64": {
                name: "sint64",
                wireType: ProtoBuf.WIRE_TYPES.VARINT
            },
            "bool": {
                name: "bool",
                wireType: ProtoBuf.WIRE_TYPES.VARINT
            },
            "double": {
                name: "double",
                wireType: ProtoBuf.WIRE_TYPES.BITS64
            },
            "string": {
                name: "string",
                wireType: ProtoBuf.WIRE_TYPES.LDELIM
            },
            "bytes": {
                name: "bytes",
                wireType: ProtoBuf.WIRE_TYPES.LDELIM
            },
            "fixed32": {
                name: "fixed32",
                wireType: ProtoBuf.WIRE_TYPES.BITS32
            },
            "sfixed32": {
                name: "sfixed32",
                wireType: ProtoBuf.WIRE_TYPES.BITS32
            },
            "fixed64": {
                name: "fixed64",
                wireType: ProtoBuf.WIRE_TYPES.BITS64
            },
            "sfixed64": {
                name: "sfixed64",
                wireType: ProtoBuf.WIRE_TYPES.BITS64
            },
            "float": {
                name: "float",
                wireType: ProtoBuf.WIRE_TYPES.BITS32
            },
            "enum": {
                name: "enum",
                wireType: ProtoBuf.WIRE_TYPES.VARINT
            },
            "message": {
                name: "message",
                wireType: ProtoBuf.WIRE_TYPES.LDELIM
            },
            "group": {
                name: "group",
                wireType: ProtoBuf.WIRE_TYPES.STARTGROUP
            }
        };

        /**
         * Minimum field id.
         * @type {number}
         * @const
         * @expose
         */
        ProtoBuf.ID_MIN = 1;

        /**
         * Maximum field id.
         * @type {number}
         * @const
         * @expose
         */
        ProtoBuf.ID_MAX = 0x1FFFFFFF;

        /**
         * @type {!function(new: ByteBuffer, ...[*])}
         * @expose
         */
        ProtoBuf.ByteBuffer = ByteBuffer;

        /**
         * @type {?function(new: Long, ...[*])}
         * @expose
         */
        ProtoBuf.Long = ByteBuffer.Long || null;

        /**
         * If set to `true`, field names will be converted from underscore notation to camel case. Defaults to `false`.
         *  Must be set prior to parsing.
         * @type {boolean}
         * @expose
         */
        ProtoBuf.convertFieldsToCamelCase = false;

        /**
         * @alias ProtoBuf.Util
         * @expose
         */
        ProtoBuf.Util = (function() {
            "use strict";

            // Object.create polyfill
            // ref: https://developer.mozilla.org/de/docs/JavaScript/Reference/Global_Objects/Object/create
            if (!Object.create)
                /** @expose */
                Object.create = function (o) {
                    if (arguments.length > 1)
                        throw Error('Object.create polyfill only accepts the first parameter.');
                    function F() {}
                    F.prototype = o;
                    return new F();
                };

            /**
             * ProtoBuf utilities.
             * @exports ProtoBuf.Util
             * @namespace
             */
            var Util = {};

            /**
             * Flag if running in node (fs is available) or not.
             * @type {boolean}
             * @const
             * @expose
             */
            Util.IS_NODE = false;
            try {
                // There is no reliable way to detect node.js as an environment, so our
                // best bet is to feature-detect what we actually need.
                Util.IS_NODE =
                    typeof require === 'function' &&
                    typeof require("fs").readFileSync === 'function' &&
                    typeof require("path").resolve === 'function';
            } catch (e) {}

            /**
             * Constructs a XMLHttpRequest object.
             * @return {XMLHttpRequest}
             * @throws {Error} If XMLHttpRequest is not supported
             * @expose
             */
            Util.XHR = function() {
                // No dependencies please, ref: http://www.quirksmode.org/js/xmlhttp.html
                var XMLHttpFactories = [
                    function () {return new XMLHttpRequest()},
                    function () {return new ActiveXObject("Msxml2.XMLHTTP")},
                    function () {return new ActiveXObject("Msxml3.XMLHTTP")},
                    function () {return new ActiveXObject("Microsoft.XMLHTTP")}
                ];
                /** @type {?XMLHttpRequest} */
                var xhr = null;
                for (var i=0;i<XMLHttpFactories.length;i++) {
                    try { xhr = XMLHttpFactories[i](); }
                    catch (e) { continue; }
                    break;
                }
                if (!xhr)
                    throw Error("XMLHttpRequest is not supported");
                return xhr;
            };

            /**
             * Fetches a resource.
             * @param {string} path Resource path
             * @param {function(?string)=} callback Callback receiving the resource's contents. If omitted the resource will
             *   be fetched synchronously. If the request failed, contents will be null.
             * @return {?string|undefined} Resource contents if callback is omitted (null if the request failed), else undefined.
             * @expose
             */
            Util.fetch = function(path, callback) {
                if (callback && typeof callback != 'function')
                    callback = null;
                if (Util.IS_NODE) {
                    if (callback) {
                        require("fs").readFile(path, function(err, data) {
                            if (err)
                                callback(null);
                            else
                                callback(""+data);
                        });
                    } else
                        try {
                            return require("fs").readFileSync(path);
                        } catch (e) {
                            return null;
                        }
                } else {
                    var xhr = Util.XHR();
                    xhr.open('GET', path, callback ? true : false);
                    // xhr.setRequestHeader('User-Agent', 'XMLHTTP/1.0');
                    xhr.setRequestHeader('Accept', 'text/plain');
                    if (typeof xhr.overrideMimeType === 'function') xhr.overrideMimeType('text/plain');
                    if (callback) {
                        xhr.onreadystatechange = function() {
                            if (xhr.readyState != 4) return;
                            if (/* remote */ xhr.status == 200 || /* local */ (xhr.status == 0 && typeof xhr.responseText === 'string'))
                                callback(xhr.responseText);
                            else
                                callback(null);
                        };
                        if (xhr.readyState == 4)
                            return;
                        xhr.send(null);
                    } else {
                        xhr.send(null);
                        if (/* remote */ xhr.status == 200 || /* local */ (xhr.status == 0 && typeof xhr.responseText === 'string'))
                            return xhr.responseText;
                        return null;
                    }
                }
            };

            /**
             * Tests if an object is an array.
             * @function
             * @param {*} obj Object to test
             * @returns {boolean} true if it is an array, else false
             * @expose
             */
            Util.isArray = Array.isArray || function(obj) {
                return Object.prototype.toString.call(obj) === "[object Array]";
            };

            return Util;
        })();

        /**
         * Language expressions.
         * @exports ProtoBuf.Lang
         * @type {Object.<string,string|RegExp>}
         * @namespace
         * @expose
         */
        ProtoBuf.Lang = {
            OPEN: "{",
            CLOSE: "}",
            OPTOPEN: "[",
            OPTCLOSE: "]",
            OPTEND: ",",
            EQUAL: "=",
            END: ";",
            STRINGOPEN: '"',
            STRINGCLOSE: '"',
            STRINGOPEN_SQ: "'",
            STRINGCLOSE_SQ: "'",
            COPTOPEN: '(',
            COPTCLOSE: ')',
            DELIM: /[\s\{\}=;\[\],'"\(\)]/g,
            // KEYWORD: /^(?:package|option|import|message|enum|extend|service|syntax|extensions|group)$/,
            RULE: /^(?:required|optional|repeated)$/,
            TYPE: /^(?:double|float|int32|uint32|sint32|int64|uint64|sint64|fixed32|sfixed32|fixed64|sfixed64|bool|string|bytes)$/,
            NAME: /^[a-zA-Z_][a-zA-Z_0-9]*$/,
            TYPEDEF: /^[a-zA-Z][a-zA-Z_0-9]*$/,
            TYPEREF: /^(?:\.?[a-zA-Z_][a-zA-Z_0-9]*)+$/,
            FQTYPEREF: /^(?:\.[a-zA-Z][a-zA-Z_0-9]*)+$/,
            NUMBER: /^-?(?:[1-9][0-9]*|0|0x[0-9a-fA-F]+|0[0-7]+|([0-9]*\.[0-9]+([Ee][+-]?[0-9]+)?))$/,
            NUMBER_DEC: /^(?:[1-9][0-9]*|0)$/,
            NUMBER_HEX: /^0x[0-9a-fA-F]+$/,
            NUMBER_OCT: /^0[0-7]+$/,
            NUMBER_FLT: /^[0-9]*\.[0-9]+([Ee][+-]?[0-9]+)?$/,
            ID: /^(?:[1-9][0-9]*|0|0x[0-9a-fA-F]+|0[0-7]+)$/,
            NEGID: /^\-?(?:[1-9][0-9]*|0|0x[0-9a-fA-F]+|0[0-7]+)$/,
            WHITESPACE: /\s/,
            STRING: /['"]([^'"\\]*(\\.[^"\\]*)*)['"]/g,
            BOOL: /^(?:true|false)$/i
        };

        /**
         * @alias ProtoBuf.DotProto
         * @expose
         */
        ProtoBuf.DotProto = (function(ProtoBuf, Lang) {
            "use strict";

            /**
             * Utilities to parse .proto files.
             * @exports ProtoBuf.DotProto
             * @namespace
             */
            var DotProto = {};

            /**
             * Constructs a new Tokenizer.
             * @exports ProtoBuf.DotProto.Tokenizer
             * @class proto tokenizer
             * @param {string} proto Proto to tokenize
             * @constructor
             */
            var Tokenizer = function(proto) {

                /**
                 * Source to parse.
                 * @type {string}
                 * @expose
                 */
                this.source = ""+proto; // In case it's a buffer

                /**
                 * Current index.
                 * @type {number}
                 * @expose
                 */
                this.index = 0;

                /**
                 * Current line.
                 * @type {number}
                 * @expose
                 */
                this.line = 1;

                /**
                 * Stacked values.
                 * @type {Array}
                 * @expose
                 */
                this.stack = [];

                /**
                 * Whether currently reading a string or not.
                 * @type {boolean}
                 * @expose
                 */
                this.readingString = false;

                /**
                 * Whatever character ends the string. Either a single or double quote character.
                 * @type {string}
                 * @expose
                 */
                this.stringEndsWith = Lang.STRINGCLOSE;
            };

            /**
             * Reads a string beginning at the current index.
             * @return {string} The string
             * @throws {Error} If it's not a valid string
             * @private
             */
            Tokenizer.prototype._readString = function() {
                Lang.STRING.lastIndex = this.index-1; // Include the open quote
                var match;
                if ((match = Lang.STRING.exec(this.source)) !== null) {
                    var s = match[1];
                    this.index = Lang.STRING.lastIndex;
                    this.stack.push(this.stringEndsWith);
                    return s;
                }
                throw Error("Illegal string value at line "+this.line+", index "+this.index);
            };

            /**
             * Gets the next token and advances by one.
             * @return {?string} Token or `null` on EOF
             * @throws {Error} If it's not a valid proto file
             * @expose
             */
            Tokenizer.prototype.next = function() {
                if (this.stack.length > 0)
                    return this.stack.shift();
                if (this.index >= this.source.length)
                    return null; // No more tokens
                if (this.readingString) {
                    this.readingString = false;
                    return this._readString();
                }
                var repeat, last;
                do {
                    repeat = false;
                    // Strip white spaces
                    while (Lang.WHITESPACE.test(last = this.source.charAt(this.index))) {
                        this.index++;
                        if (last === "\n")
                            this.line++;
                        if (this.index === this.source.length)
                            return null;
                    }
                    // Strip comments
                    if (this.source.charAt(this.index) === '/') {
                        if (this.source.charAt(++this.index) === '/') { // Single line
                            while (this.source.charAt(this.index) !== "\n") {
                                this.index++;
                                if (this.index == this.source.length)
                                    return null;
                            }
                            this.index++;
                            this.line++;
                            repeat = true;
                        } else if (this.source.charAt(this.index) === '*') { /* Block */
                            last = '';
                            while (last+(last=this.source.charAt(this.index)) !== '*/') {
                                this.index++;
                                if (last === "\n")
                                    this.line++;
                                if (this.index === this.source.length)
                                    return null;
                            }
                            this.index++;
                            repeat = true;
                        } else
                            throw Error("Invalid comment at line "+this.line+": /"+this.source.charAt(this.index)+" ('/' or '*' expected)");
                    }
                } while (repeat);
                if (this.index === this.source.length) return null;

                // Read the next token
                var end = this.index;
                Lang.DELIM.lastIndex = 0;
                var delim = Lang.DELIM.test(this.source.charAt(end));
                if (!delim) {
                    ++end;
                    while(end < this.source.length && !Lang.DELIM.test(this.source.charAt(end)))
                        end++;
                } else
                    ++end;
                var token = this.source.substring(this.index, this.index = end);
                if (token === Lang.STRINGOPEN)
                    this.readingString = true,
                    this.stringEndsWith = Lang.STRINGCLOSE;
                else if (token === Lang.STRINGOPEN_SQ)
                    this.readingString = true,
                    this.stringEndsWith = Lang.STRINGCLOSE_SQ;
                return token;
            };

            /**
             * Peeks for the next token.
             * @return {?string} Token or `null` on EOF
             * @throws {Error} If it's not a valid proto file
             * @expose
             */
            Tokenizer.prototype.peek = function() {
                if (this.stack.length === 0) {
                    var token = this.next();
                    if (token === null)
                        return null;
                    this.stack.push(token);
                }
                return this.stack[0];
            };

            /**
             * Returns a string representation of this object.
             * @return {string} String representation as of "Tokenizer(index/length)"
             * @expose
             */
            Tokenizer.prototype.toString = function() {
                return "Tokenizer("+this.index+"/"+this.source.length+" at line "+this.line+")";
            };

            /**
             * @alias ProtoBuf.DotProto.Tokenizer
             * @expose
             */
            DotProto.Tokenizer = Tokenizer;

            /**
             * Constructs a new Parser.
             * @exports ProtoBuf.DotProto.Parser
             * @class proto parser
             * @param {string} proto Protocol source
             * @constructor
             */
            var Parser = function(proto) {

                /**
                 * Tokenizer.
                 * @type {ProtoBuf.DotProto.Tokenizer}
                 * @expose
                 */
                this.tn = new Tokenizer(proto);
            };

            /**
             * Runs the parser.
             * @return {{package: string|null, messages: Array.<object>, enums: Array.<object>, imports: Array.<string>, options: object<string,*>}}
             * @throws {Error} If the source cannot be parsed
             * @expose
             */
            Parser.prototype.parse = function() {
                var topLevel = {
                    "name": "[ROOT]", // temporary
                    "package": null,
                    "messages": [],
                    "enums": [],
                    "imports": [],
                    "options": {},
                    "services": []
                };
                var token, header = true;
                while(token = this.tn.next()) {
                    switch (token) {
                        case 'package':
                            if (!header || topLevel["package"] !== null)
                                throw Error("Illegal package at line "+this.tn.line);
                            topLevel["package"] = this._parsePackage(token);
                            break;
                        case 'import':
                            if (!header)
                                throw Error("Illegal import at line "+this.tn.line);
                            topLevel.imports.push(this._parseImport(token));
                            break;
                        case 'message':
                            this._parseMessage(topLevel, null, token);
                            header = false;
                            break;
                        case 'enum':
                            this._parseEnum(topLevel, token);
                            header = false;
                            break;
                        case 'option':
                            if (!header)
                                throw Error("Illegal option at line "+this.tn.line);
                            this._parseOption(topLevel, token);
                            break;
                        case 'service':
                            this._parseService(topLevel, token);
                            break;
                        case 'extend':
                            this._parseExtend(topLevel, token);
                            break;
                        case 'syntax':
                            this._parseIgnoredStatement(topLevel, token);
                            break;
                        default:
                            throw Error("Illegal token at line "+this.tn.line+": "+token);
                    }
                }
                delete topLevel["name"];
                return topLevel;
            };

            /**
             * Parses a number value.
             * @param {string} val Number value to parse
             * @return {number} Number
             * @throws {Error} If the number value is invalid
             * @private
             */
            Parser.prototype._parseNumber = function(val) {
                var sign = 1;
                if (val.charAt(0) == '-')
                    sign = -1,
                    val = val.substring(1);
                if (Lang.NUMBER_DEC.test(val))
                    return sign*parseInt(val, 10);
                else if (Lang.NUMBER_HEX.test(val))
                    return sign*parseInt(val.substring(2), 16);
                else if (Lang.NUMBER_OCT.test(val))
                    return sign*parseInt(val.substring(1), 8);
                else if (Lang.NUMBER_FLT.test(val))
                    return sign*parseFloat(val);
                throw Error("Illegal number at line "+this.tn.line+": "+(sign < 0 ? '-' : '')+val);
            };

            /**
             * Parses an ID value.
             * @param {string} val ID value to parse
             * @param {boolean=} neg Whether the ID may be negative, defaults to `false`
             * @returns {number} ID
             * @throws {Error} If the ID value is invalid
             * @private
             */
            Parser.prototype._parseId = function(val, neg) {
                var id = -1;
                var sign = 1;
                if (val.charAt(0) == '-')
                    sign = -1,
                    val = val.substring(1);
                if (Lang.NUMBER_DEC.test(val))
                    id = parseInt(val);
                else if (Lang.NUMBER_HEX.test(val))
                    id = parseInt(val.substring(2), 16);
                else if (Lang.NUMBER_OCT.test(val))
                    id = parseInt(val.substring(1), 8);
                else
                    throw Error("Illegal ID at line "+this.tn.line+": "+(sign < 0 ? '-' : '')+val);
                id = (sign*id)|0; // Force to 32bit
                if (!neg && id < 0)
                    throw Error("Illegal ID at line "+this.tn.line+": "+(sign < 0 ? '-' : '')+val);
                return id;
            };

            /**
             * Parses the package definition.
             * @param {string} token Initial token
             * @return {string} Package name
             * @throws {Error} If the package definition cannot be parsed
             * @private
             */
            Parser.prototype._parsePackage = function(token) {
                token = this.tn.next();
                if (!Lang.TYPEREF.test(token))
                    throw Error("Illegal package at line "+this.tn.line+": "+token);
                var pkg = token;
                token = this.tn.next();
                if (token != Lang.END)
                    throw Error("Illegal end of package at line "+this.tn.line+": "+token+" ('"+Lang.END+"' expected)");
                return pkg;
            };

            /**
             * Parses an import definition.
             * @param {string} token Initial token
             * @return {string} Import file name
             * @throws {Error} If the import definition cannot be parsed
             * @private
             */
            Parser.prototype._parseImport = function(token) {
                token = this.tn.next();
                if (token === "public")
                    token = this.tn.next();
                if (token !== Lang.STRINGOPEN && token !== Lang.STRINGOPEN_SQ)
                    throw Error("Illegal import at line "+this.tn.line+": "+token+" ('"+Lang.STRINGOPEN+"' or '"+Lang.STRINGOPEN_SQ+"' expected)");
                var imported = this.tn.next();
                token = this.tn.next();
                if (token !== this.tn.stringEndsWith)
                    throw Error("Illegal import at line "+this.tn.line+": "+token+" ('"+this.tn.stringEndsWith+"' expected)");
                token = this.tn.next();
                if (token !== Lang.END)
                    throw Error("Illegal import at line "+this.tn.line+": "+token+" ('"+Lang.END+"' expected)");
                return imported;
            };

            /**
             * Parses a namespace option.
             * @param {Object} parent Parent definition
             * @param {string} token Initial token
             * @throws {Error} If the option cannot be parsed
             * @private
             */
            Parser.prototype._parseOption = function(parent, token) {
                token = this.tn.next();
                var custom = false;
                if (token == Lang.COPTOPEN)
                    custom = true,
                    token = this.tn.next();
                if (!Lang.TYPEREF.test(token))
                    // we can allow options of the form google.protobuf.* since they will just get ignored anyways
                    if (!/google\.protobuf\./.test(token))
                        throw Error("Illegal option in message "+parent.name+" at line "+this.tn.line+": "+token);
                var name = token;
                token = this.tn.next();
                if (custom) { // (my_method_option).foo, (my_method_option), some_method_option, (foo.my_option).bar
                    if (token !== Lang.COPTCLOSE)
                        throw Error("Illegal option in message "+parent.name+", option "+name+" at line "+this.tn.line+": "+token+" ('"+Lang.COPTCLOSE+"' expected)");
                    name = '('+name+')';
                    token = this.tn.next();
                    if (Lang.FQTYPEREF.test(token))
                        name += token,
                        token = this.tn.next();
                }
                if (token !== Lang.EQUAL)
                    throw Error("Illegal option operator in message "+parent.name+", option "+name+" at line "+this.tn.line+": "+token+" ('"+Lang.EQUAL+"' expected)");
                var value;
                token = this.tn.next();
                if (token === Lang.STRINGOPEN || token === Lang.STRINGOPEN_SQ) {
                    value = this.tn.next();
                    token = this.tn.next();
                    if (token !== this.tn.stringEndsWith)
                        throw Error("Illegal end of option value in message "+parent.name+", option "+name+" at line "+this.tn.line+": "+token+" ('"+this.tn.stringEndsWith+"' expected)");
                } else {
                    if (Lang.NUMBER.test(token))
                        value = this._parseNumber(token, true);
                    else if (Lang.BOOL.test(token))
                        value = token === 'true';
                    else if (Lang.TYPEREF.test(token))
                        value = token;
                    else
                        throw Error("Illegal option value in message "+parent.name+", option "+name+" at line "+this.tn.line+": "+token);
                }
                token = this.tn.next();
                if (token !== Lang.END)
                    throw Error("Illegal end of option in message "+parent.name+", option "+name+" at line "+this.tn.line+": "+token+" ('"+Lang.END+"' expected)");
                parent["options"][name] = value;
            };

            /**
             * Parses an ignored statement of the form ['keyword', ..., ';'].
             * @param {Object} parent Parent definition
             * @param {string} keyword Initial token
             * @throws {Error} If the directive cannot be parsed
             * @private
             */
            Parser.prototype._parseIgnoredStatement = function(parent, keyword) {
                var token;
                do {
                    token = this.tn.next();
                    if (token === null)
                        throw Error("Unexpected EOF in "+parent.name+", "+keyword+" (ignored) at line "+this.tn.line);
                    if (token === Lang.END)
                        break;
                } while (true);
            };

            /**
             * Parses a service definition.
             * @param {Object} parent Parent definition
             * @param {string} token Initial token
             * @throws {Error} If the service cannot be parsed
             * @private
             */
            Parser.prototype._parseService = function(parent, token) {
                token = this.tn.next();
                if (!Lang.NAME.test(token))
                    throw Error("Illegal service name at line "+this.tn.line+": "+token);
                var name = token;
                var svc = {
                    "name": name,
                    "rpc": {},
                    "options": {}
                };
                token = this.tn.next();
                if (token !== Lang.OPEN)
                    throw Error("Illegal OPEN after service "+name+" at line "+this.tn.line+": "+token+" ('"+Lang.OPEN+"' expected)");
                do {
                    token = this.tn.next();
                    if (token === "option")
                        this._parseOption(svc, token);
                    else if (token === 'rpc')
                        this._parseServiceRPC(svc, token);
                    else if (token !== Lang.CLOSE)
                        throw Error("Illegal type for service "+name+" at line "+this.tn.line+": "+token);
                } while (token !== Lang.CLOSE);
                parent["services"].push(svc);
            };

            /**
             * Parses a RPC service definition of the form ['rpc', name, (request), 'returns', (response)].
             * @param {Object} svc Parent definition
             * @param {string} token Initial token
             * @private
             */
            Parser.prototype._parseServiceRPC = function(svc, token) {
                var type = token;
                token = this.tn.next();
                if (!Lang.NAME.test(token))
                    throw Error("Illegal RPC method name in service "+svc["name"]+" at line "+this.tn.line+": "+token);
                var name = token;
                var method = {
                    "request": null,
                    "response": null,
                    "options": {}
                };
                token = this.tn.next();
                if (token !== Lang.COPTOPEN)
                    throw Error("Illegal start of request type in RPC service "+svc["name"]+"#"+name+" at line "+this.tn.line+": "+token+" ('"+Lang.COPTOPEN+"' expected)");
                token = this.tn.next();
                if (!Lang.TYPEREF.test(token))
                    throw Error("Illegal request type in RPC service "+svc["name"]+"#"+name+" at line "+this.tn.line+": "+token);
                method["request"] = token;
                token = this.tn.next();
                if (token != Lang.COPTCLOSE)
                    throw Error("Illegal end of request type in RPC service "+svc["name"]+"#"+name+" at line "+this.tn.line+": "+token+" ('"+Lang.COPTCLOSE+"' expected)");
                token = this.tn.next();
                if (token.toLowerCase() !== "returns")
                    throw Error("Illegal request/response delimiter in RPC service "+svc["name"]+"#"+name+" at line "+this.tn.line+": "+token+" ('returns' expected)");
                token = this.tn.next();
                if (token != Lang.COPTOPEN)
                    throw Error("Illegal start of response type in RPC service "+svc["name"]+"#"+name+" at line "+this.tn.line+": "+token+" ('"+Lang.COPTOPEN+"' expected)");
                token = this.tn.next();
                method["response"] = token;
                token = this.tn.next();
                if (token !== Lang.COPTCLOSE)
                    throw Error("Illegal end of response type in RPC service "+svc["name"]+"#"+name+" at line "+this.tn.line+": "+token+" ('"+Lang.COPTCLOSE+"' expected)");
                token = this.tn.next();
                if (token === Lang.OPEN) {
                    do {
                        token = this.tn.next();
                        if (token === 'option')
                            this._parseOption(method, token); // <- will fail for the custom-options example
                        else if (token !== Lang.CLOSE)
                            throw Error("Illegal start of option in RPC service "+svc["name"]+"#"+name+" at line "+this.tn.line+": "+token+" ('option' expected)");
                    } while (token !== Lang.CLOSE);
                    if (this.tn.peek() === Lang.END)
                        this.tn.next();
                } else if (token !== Lang.END)
                    throw Error("Illegal method delimiter in RPC service "+svc["name"]+"#"+name+" at line "+this.tn.line+": "+token+" ('"+Lang.END+"' or '"+Lang.OPEN+"' expected)");
                if (typeof svc[type] === 'undefined')
                    svc[type] = {};
                svc[type][name] = method;
            };

            /**
             * Parses a message definition.
             * @param {Object} parent Parent definition
             * @param {Object} fld Field definition if this is a group, otherwise `null`
             * @param {string} token First token
             * @return {Object}
             * @throws {Error} If the message cannot be parsed
             * @private
             */
            Parser.prototype._parseMessage = function(parent, fld, token) {
                /** @dict */
                var msg = {}; // Note: At some point we might want to exclude the parser, so we need a dict.
                var isGroup = token === "group";
                token = this.tn.next();
                if (!Lang.NAME.test(token))
                    throw Error("Illegal "+(isGroup ? "group" : "message")+" name"+(parent ? " in message "+parent["name"] : "")+" at line "+this.tn.line+": "+token);
                msg["name"] = token;
                if (isGroup) {
                    token = this.tn.next();
                    if (token !== Lang.EQUAL)
                        throw Error("Illegal id assignment after group "+msg.name+" at line "+this.tn.line+": "+token+" ('"+Lang.EQUAL+"' expected)");
                    token = this.tn.next();
                    try {
                        fld["id"] = this._parseId(token);
                    } catch (e) {
                        throw Error("Illegal field id value for group "+msg.name+"#"+fld.name+" at line "+this.tn.line+": "+token);
                    }
                    msg["isGroup"] = true;
                }
                msg["fields"] = []; // Note: Using arrays to support also browser that cannot preserve order of object keys.
                msg["enums"] = [];
                msg["messages"] = [];
                msg["options"] = {};
                token = this.tn.next();
                if (token === Lang.OPTOPEN && fld)
                    this._parseFieldOptions(msg, fld, token),
                    token = this.tn.next();
                if (token !== Lang.OPEN)
                    throw Error("Illegal OPEN after "+(isGroup ? "group" : "message")+" "+msg.name+" at line "+this.tn.line+": "+token+" ('"+Lang.OPEN+"' expected)");
                // msg["extensions"] = undefined
                do {
                    token = this.tn.next();
                    if (token === Lang.CLOSE) {
                        token = this.tn.peek();
                        if (token === Lang.END)
                            this.tn.next();
                        break;
                    } else if (Lang.RULE.test(token))
                        this._parseMessageField(msg, token);
                    else if (token === "enum")
                        this._parseEnum(msg, token);
                    else if (token === "message")
                        this._parseMessage(msg, null, token);
                    else if (token === "option")
                        this._parseOption(msg, token);
                    else if (token === "extensions")
                        msg["extensions"] = this._parseExtensions(msg, token);
                    else if (token === "extend")
                        this._parseExtend(msg, token);
                    else
                        throw Error("Illegal token in message "+msg.name+" at line "+this.tn.line+": "+token+" (type or '"+Lang.CLOSE+"' expected)");
                } while (true);
                parent["messages"].push(msg);
                return msg;
            };

            /**
             * Parses a message field.
             * @param {Object} msg Message definition
             * @param {string} token Initial token
             * @throws {Error} If the message field cannot be parsed
             * @private
             */
            Parser.prototype._parseMessageField = function(msg, token) {
                /** @dict */
                var fld = {}, grp = null;
                fld["rule"] = token;
                /** @dict */
                fld["options"] = {};
                token = this.tn.next();
                if (token === "group") {
                    // "A [legacy] group simply combines a nested message type and a field into a single declaration. In your
                    // code, you can treat this message just as if it had a Result type field called result (the latter name is
                    // converted to lower-case so that it does not conflict with the former)."
                    grp = this._parseMessage(msg, fld, token);
                    if (!/^[A-Z]/.test(grp["name"]))
                        throw Error('Group names must start with a capital letter');
                    fld["type"] = grp["name"];
                    fld["name"] = grp["name"].toLowerCase();
                    token = this.tn.peek();
                    if (token === Lang.END)
                        this.tn.next();
                } else {
                    if (!Lang.TYPE.test(token) && !Lang.TYPEREF.test(token))
                        throw Error("Illegal field type in message "+msg.name+" at line "+this.tn.line+": "+token);
                    fld["type"] = token;
                    token = this.tn.next();
                    if (!Lang.NAME.test(token))
                        throw Error("Illegal field name in message "+msg.name+" at line "+this.tn.line+": "+token);
                    fld["name"] = token;
                    token = this.tn.next();
                    if (token !== Lang.EQUAL)
                        throw Error("Illegal field id assignment in message "+msg.name+"#"+fld.name+" at line "+this.tn.line+": "+token+" ('"+Lang.EQUAL+"' expected)");
                    token = this.tn.next();
                    try {
                        fld["id"] = this._parseId(token);
                    } catch (e) {
                        throw Error("Illegal field id value in message "+msg.name+"#"+fld.name+" at line "+this.tn.line+": "+token);
                    }
                    token = this.tn.next();
                    if (token === Lang.OPTOPEN)
                        this._parseFieldOptions(msg, fld, token),
                        token = this.tn.next();
                    if (token !== Lang.END)
                        throw Error("Illegal field delimiter in message "+msg.name+"#"+fld.name+" at line "+this.tn.line+": "+token+" ('"+Lang.END+"' expected)");
                }
                msg["fields"].push(fld);
            };

            /**
             * Parses a set of field option definitions.
             * @param {Object} msg Message definition
             * @param {Object} fld Field definition
             * @param {string} token Initial token
             * @throws {Error} If the message field options cannot be parsed
             * @private
             */
            Parser.prototype._parseFieldOptions = function(msg, fld, token) {
                var first = true;
                do {
                    token = this.tn.next();
                    if (token === Lang.OPTCLOSE)
                        break;
                    else if (token === Lang.OPTEND) {
                        if (first)
                            throw Error("Illegal start of message field options in message "+msg.name+"#"+fld.name+" at line "+this.tn.line+": "+token);
                        token = this.tn.next();
                    }
                    this._parseFieldOption(msg, fld, token);
                    first = false;
                } while (true);
            };

            /**
             * Parses a single field option.
             * @param {Object} msg Message definition
             * @param {Object} fld Field definition
             * @param {string} token Initial token
             * @throws {Error} If the mesage field option cannot be parsed
             * @private
             */
            Parser.prototype._parseFieldOption = function(msg, fld, token) {
                var custom = false;
                if (token === Lang.COPTOPEN)
                    token = this.tn.next(),
                    custom = true;
                if (!Lang.TYPEREF.test(token))
                    throw Error("Illegal field option in message "+msg.name+"#"+fld.name+" at line "+this.tn.line+": "+token);
                var name = token;
                token = this.tn.next();
                if (custom) {
                    if (token !== Lang.COPTCLOSE)
                        throw Error("Illegal custom field option name delimiter in message "+msg.name+"#"+fld.name+" at line "+this.tn.line+": "+token+" (')' expected)");
                    name = '('+name+')';
                    token = this.tn.next();
                    if (Lang.FQTYPEREF.test(token))
                        name += token,
                        token = this.tn.next();
                }
                if (token !== Lang.EQUAL)
                    throw Error("Illegal field option operation in message "+msg.name+"#"+fld.name+" at line "+this.tn.line+": "+token+" ('=' expected)");
                var value;
                token = this.tn.next();
                if (token === Lang.STRINGOPEN || token === Lang.STRINGOPEN_SQ) {
                    value = this.tn.next();
                    token = this.tn.next();
                    if (token != this.tn.stringEndsWith)
                        throw Error("Illegal end of field value in message "+msg.name+"#"+fld.name+", option "+name+" at line "+this.tn.line+": "+token+" ('"+this.tn.stringEndsWith+"' expected)");
                } else if (Lang.NUMBER.test(token, true))
                    value = this._parseNumber(token, true);
                else if (Lang.BOOL.test(token))
                    value = token.toLowerCase() === 'true';
                else if (Lang.TYPEREF.test(token))
                    value = token; // TODO: Resolve?
                else
                    throw Error("Illegal field option value in message "+msg.name+"#"+fld.name+", option "+name+" at line "+this.tn.line+": "+token);
                fld["options"][name] = value;
            };

            /**
             * Parses an enum.
             * @param {Object} msg Message definition
             * @param {string} token Initial token
             * @throws {Error} If the enum cannot be parsed
             * @private
             */
            Parser.prototype._parseEnum = function(msg, token) {
                /** @dict */
                var enm = {};
                token = this.tn.next();
                if (!Lang.NAME.test(token))
                    throw Error("Illegal enum name in message "+msg.name+" at line "+this.tn.line+": "+token);
                enm["name"] = token;
                token = this.tn.next();
                if (token !== Lang.OPEN)
                    throw Error("Illegal OPEN after enum "+enm.name+" at line "+this.tn.line+": "+token);
                enm["values"] = [];
                enm["options"] = {};
                do {
                    token = this.tn.next();
                    if (token === Lang.CLOSE) {
                        token = this.tn.peek();
                        if (token === Lang.END)
                            this.tn.next();
                        break;
                    }
                    if (token == 'option')
                        this._parseOption(enm, token);
                    else {
                        if (!Lang.NAME.test(token))
                            throw Error("Illegal enum value name in enum "+enm.name+" at line "+this.tn.line+": "+token);
                        this._parseEnumValue(enm, token);
                    }
                } while (true);
                msg["enums"].push(enm);
            };

            /**
             * Parses an enum value.
             * @param {Object} enm Enum definition
             * @param {string} token Initial token
             * @throws {Error} If the enum value cannot be parsed
             * @private
             */
            Parser.prototype._parseEnumValue = function(enm, token) {
                /** @dict */
                var val = {};
                val["name"] = token;
                token = this.tn.next();
                if (token !== Lang.EQUAL)
                    throw Error("Illegal enum value operator in enum "+enm.name+" at line "+this.tn.line+": "+token+" ('"+Lang.EQUAL+"' expected)");
                token = this.tn.next();
                try {
                    val["id"] = this._parseId(token, true);
                } catch (e) {
                    throw Error("Illegal enum value id in enum "+enm.name+" at line "+this.tn.line+": "+token);
                }
                enm["values"].push(val);
                token = this.tn.next();
                if (token === Lang.OPTOPEN) {
                    var opt = { 'options' : {} }; // TODO: Actually expose them somehow.
                    this._parseFieldOptions(enm, opt, token);
                    token = this.tn.next();
                }
                if (token !== Lang.END)
                    throw Error("Illegal enum value delimiter in enum "+enm.name+" at line "+this.tn.line+": "+token+" ('"+Lang.END+"' expected)");
            };

            /**
             * Parses an extensions statement.
             * @param {Object} msg Message object
             * @param {string} token Initial token
             * @throws {Error} If the extensions statement cannot be parsed
             * @private
             */
            Parser.prototype._parseExtensions = function(msg, token) {
                /** @type {Array.<number>} */
                var range = [];
                token = this.tn.next();
                if (token === "min") // FIXME: Does the official implementation support this?
                    range.push(ProtoBuf.ID_MIN);
                else if (token === "max")
                    range.push(ProtoBuf.ID_MAX);
                else
                    range.push(this._parseNumber(token));
                token = this.tn.next();
                if (token !== 'to')
                    throw Error("Illegal extensions delimiter in message "+msg.name+" at line "+this.tn.line+" ('to' expected)");
                token = this.tn.next();
                if (token === "min")
                    range.push(ProtoBuf.ID_MIN);
                else if (token === "max")
                    range.push(ProtoBuf.ID_MAX);
                else
                    range.push(this._parseNumber(token));
                token = this.tn.next();
                if (token !== Lang.END)
                    throw Error("Illegal extension delimiter in message "+msg.name+" at line "+this.tn.line+": "+token+" ('"+Lang.END+"' expected)");
                return range;
            };

            /**
             * Parses an extend block.
             * @param {Object} parent Parent object
             * @param {string} token Initial token
             * @throws {Error} If the extend block cannot be parsed
             * @private
             */
            Parser.prototype._parseExtend = function(parent, token) {
                token = this.tn.next();
                if (!Lang.TYPEREF.test(token))
                    throw Error("Illegal extended message name at line "+this.tn.line+": "+token);
                /** @dict */
                var ext = {};
                ext["ref"] = token;
                ext["fields"] = [];
                token = this.tn.next();
                if (token !== Lang.OPEN)
                    throw Error("Illegal OPEN in extend "+ext.name+" at line "+this.tn.line+": "+token+" ('"+Lang.OPEN+"' expected)");
                do {
                    token = this.tn.next();
                    if (token === Lang.CLOSE) {
                        token = this.tn.peek();
                        if (token == Lang.END)
                            this.tn.next();
                        break;
                    } else if (Lang.RULE.test(token))
                        this._parseMessageField(ext, token);
                    else
                        throw Error("Illegal token in extend "+ext.name+" at line "+this.tn.line+": "+token+" (rule or '"+Lang.CLOSE+"' expected)");
                } while (true);
                parent["messages"].push(ext);
                return ext;
            };

            /**
             * Returns a string representation of this object.
             * @returns {string} String representation as of "Parser"
             */
            Parser.prototype.toString = function() {
                return "Parser";
            };

            /**
             * @alias ProtoBuf.DotProto.Parser
             * @expose
             */
            DotProto.Parser = Parser;

            return DotProto;

        })(ProtoBuf, ProtoBuf.Lang);

        /**
         * @alias ProtoBuf.Reflect
         * @expose
         */
        ProtoBuf.Reflect = (function(ProtoBuf) {
            "use strict";

            /**
             * Reflection types.
             * @exports ProtoBuf.Reflect
             * @namespace
             */
            var Reflect = {};

            /**
             * Constructs a Reflect base class.
             * @exports ProtoBuf.Reflect.T
             * @constructor
             * @abstract
             * @param {ProtoBuf.Reflect.T} parent Parent object
             * @param {string} name Object name
             */
            var T = function(parent, name) {

                /**
                 * Parent object.
                 * @type {ProtoBuf.Reflect.T|null}
                 * @expose
                 */
                this.parent = parent;

                /**
                 * Object name in namespace.
                 * @type {string}
                 * @expose
                 */
                this.name = name;

                /**
                 * Fully qualified class name
                 * @type {string}
                 * @expose
                 */
                this.className;
            };

            /**
             * Returns the fully qualified name of this object.
             * @returns {string} Fully qualified name as of ".PATH.TO.THIS"
             * @expose
             */
            T.prototype.fqn = function() {
                var name = this.name,
                    ptr = this;
                do {
                    ptr = ptr.parent;
                    if (ptr == null)
                        break;
                    name = ptr.name+"."+name;
                } while (true);
                return name;
            };

            /**
             * Returns a string representation of this Reflect object (its fully qualified name).
             * @param {boolean=} includeClass Set to true to include the class name. Defaults to false.
             * @return String representation
             * @expose
             */
            T.prototype.toString = function(includeClass) {
                return (includeClass ? this.className + " " : "") + this.fqn();
            };

            /**
             * Builds this type.
             * @throws {Error} If this type cannot be built directly
             * @expose
             */
            T.prototype.build = function() {
                throw Error(this.toString(true)+" cannot be built directly");
            };

            /**
             * @alias ProtoBuf.Reflect.T
             * @expose
             */
            Reflect.T = T;

            /**
             * Constructs a new Namespace.
             * @exports ProtoBuf.Reflect.Namespace
             * @param {ProtoBuf.Reflect.Namespace|null} parent Namespace parent
             * @param {string} name Namespace name
             * @param {Object.<string,*>} options Namespace options
             * @constructor
             * @extends ProtoBuf.Reflect.T
             */
            var Namespace = function(parent, name, options) {
                T.call(this, parent, name);

                /**
                 * @override
                 */
                this.className = "Namespace";

                /**
                 * Children inside the namespace.
                 * @type {Array.<ProtoBuf.Reflect.T>}
                 */
                this.children = [];

                /**
                 * Options.
                 * @type {Object.<string, *>}
                 */
                this.options = options || {};
            };

            // Extends T
            Namespace.prototype = Object.create(T.prototype);

            /**
             * Returns an array of the namespace's children.
             * @param {ProtoBuf.Reflect.T=} type Filter type (returns instances of this type only). Defaults to null (all children).
             * @return {Array.<ProtoBuf.Reflect.T>}
             * @expose
             */
            Namespace.prototype.getChildren = function(type) {
                type = type || null;
                if (type == null)
                    return this.children.slice();
                var children = [];
                for (var i=0, k=this.children.length; i<k; ++i)
                    if (this.children[i] instanceof type)
                        // We also need to distinguish between Field and ExtensionField which is an instance of Field
                        if (type !== Message.Field || !(this.children[i] instanceof Message.ExtensionField))
                            children.push(this.children[i]);
                return children;
            };

            /**
             * Adds a child to the namespace.
             * @param {ProtoBuf.Reflect.T} child Child
             * @throws {Error} If the child cannot be added (duplicate)
             * @expose
             */
            Namespace.prototype.addChild = function(child) {
                var other;
                if (other = this.getChild(child.name)) {
                    // Try to revert camelcase transformation on collision
                    if (other instanceof Message.Field && other.name !== other.originalName && !this.hasChild(other.originalName))
                        other.name = other.originalName; // Revert previous first (effectively keeps both originals)
                    else if (child instanceof Message.Field && child.name !== child.originalName && !this.hasChild(child.originalName))
                        child.name = child.originalName;
                    else
                        throw Error("Duplicate name in namespace "+this.toString(true)+": "+child.name);
                }
                this.children.push(child);
            };

            /**
             * Tests if this namespace has a child with the specified name.
             * @param {string|number} nameOrId Child name or id
             * @returns {boolean} true if there is one, else false
             * @expose
             */
            Namespace.prototype.hasChild = function(nameOrId) {
                return this._indexOf(nameOrId) > -1;
            };

            /**
             * Gets a child by its name.
             * @param {string|number} nameOrId Child name or id
             * @return {?ProtoBuf.Reflect.T} The child or null if not found
             * @expose
             */
            Namespace.prototype.getChild = function(nameOrId) {
                var index = this._indexOf(nameOrId);
                return index > -1 ? this.children[index] : null;
            };

            /**
             * Returns child index by its name or id.
             * @param {string|number} nameOrId Child name or id
             * @return {Number} The child index
             * @private
             */
            Namespace.prototype._indexOf = function(nameOrId) {
                var key = typeof nameOrId === 'number' ? 'id' : 'name';
                for (var i=0; i<this.children.length; i++)
                    if (typeof this.children[i][key] !== 'undefined' && this.children[i][key] == nameOrId)
                        return i;
                return -1;
            };

            /**
             * Resolves a reflect object inside of this namespace.
             * @param {string} qn Qualified name to resolve
             * @param {boolean=} excludeFields Excludes fields, defaults to `false`
             * @return {ProtoBuf.Reflect.Namespace|null} The resolved type or null if not found
             * @expose
             */
            Namespace.prototype.resolve = function(qn, excludeFields) {
                var part = qn.split(".");
                var ptr = this, i=0;
                if (part[i] == "") { // Fully qualified name, e.g. ".My.Message'
                    while (ptr.parent != null)
                        ptr = ptr.parent;
                    i++;
                }
                var child;
                do {
                    do {
                        child = ptr.getChild(part[i]);
                        if (!child || !(child instanceof Reflect.T) || (excludeFields && child instanceof Reflect.Message.Field)) {
                            ptr = null;
                            break;
                        }
                        ptr = child; i++;
                    } while (i < part.length);
                    if (ptr != null)
                        break; // Found
                    // Else search the parent
                    if (this.parent !== null) {
                        return this.parent.resolve(qn, excludeFields);
                    }
                } while (ptr != null);
                return ptr;
            };

            /**
             * Builds the namespace and returns the runtime counterpart.
             * @return {Object.<string,Function|Object>} Runtime namespace
             * @expose
             */
            Namespace.prototype.build = function() {
                /** @dict */
                var ns = {};
                var children = this.getChildren(), child;
                for (var i=0, k=children.length; i<k; ++i) {
                    child = children[i];
                    if (child instanceof Namespace)
                        ns[child.name] = child.build();
                }
                if (Object.defineProperty)
                    Object.defineProperty(ns, "$options", { "value": this.buildOpt() });
                return ns;
            };

            /**
             * Builds the namespace's '$options' property.
             * @return {Object.<string,*>}
             */
            Namespace.prototype.buildOpt = function() {
                var opt = {};
                var keys = Object.keys(this.options);
                for (var i=0; i<keys.length; i++) {
                    var key = keys[i],
                        val = this.options[keys[i]];
                    // TODO: Options are not resolved, yet.
                    // if (val instanceof Namespace) {
                    //     opt[key] = val.build();
                    // } else {
                    opt[key] = val;
                    // }
                }
                return opt;
            };

            /**
             * Gets the value assigned to the option with the specified name.
             * @param {string=} name Returns the option value if specified, otherwise all options are returned.
             * @return {*|Object.<string,*>}null} Option value or NULL if there is no such option
             */
            Namespace.prototype.getOption = function(name) {
                if (typeof name === 'undefined')
                    return this.options;
                return typeof this.options[name] !== 'undefined' ? this.options[name] : null;
            };

            /**
             * @alias ProtoBuf.Reflect.Namespace
             * @expose
             */
            Reflect.Namespace = Namespace;

            /**
             * Constructs a new Message.
             * @exports ProtoBuf.Reflect.Message
             * @param {ProtoBuf.Reflect.Namespace} parent Parent message or namespace
             * @param {string} name Message name
             * @param {Object.<string,*>} options Message options
             * @param {boolean=} isGroup `true` if this is a legacy group
             * @constructor
             * @extends ProtoBuf.Reflect.Namespace
             */
            var Message = function(parent, name, options, isGroup) {
                Namespace.call(this, parent, name, options);

                /**
                 * @override
                 */
                this.className = "Message";

                /**
                 * Extensions range.
                 * @type {!Array.<number>}
                 * @expose
                 */
                this.extensions = [ProtoBuf.ID_MIN, ProtoBuf.ID_MAX];

                /**
                 * Runtime message class.
                 * @type {?function(new:ProtoBuf.Builder.Message)}
                 * @expose
                 */
                this.clazz = null;

                /**
                 * Whether this is a legacy group or not.
                 * @type {boolean}
                 * @expose
                 */
                this.isGroup = !!isGroup;
            };

            // Extends Namespace
            Message.prototype = Object.create(Namespace.prototype);

            /**
             * Builds the message and returns the runtime counterpart, which is a fully functional class.
             * @see ProtoBuf.Builder.Message
             * @param {boolean=} rebuild Whether to rebuild or not, defaults to false
             * @return {ProtoBuf.Reflect.Message} Message class
             * @throws {Error} If the message cannot be built
             * @expose
             */
            Message.prototype.build = function(rebuild) {
                if (this.clazz && !rebuild) return this.clazz;

                // We need to create a prototyped Message class in an isolated scope
                var clazz = (function(ProtoBuf, T) {

                    var fields = T.getChildren(ProtoBuf.Reflect.Message.Field);

                    /**
                     * Constructs a new runtime Message.
                     * @name ProtoBuf.Builder.Message
                     * @class Barebone of all runtime messages.
                     * @param {Object.<string,*>|...[string]} values Preset values
                     * @constructor
                     * @throws {Error} If the message cannot be created
                     */
                    var Message = function(values) {
                        ProtoBuf.Builder.Message.call(this);
                        var i, field;

                        // Create fields on the object itself to allow setting and getting through Message#fieldname
                        for (i=0; i<fields.length; i++) {
                            field = fields[i];
                            this[field.name] = (field.repeated) ? [] : null;
                        }
                        // Set the default values
                        for (i=0; i<fields.length; i++) {
                            field = fields[i];
                            if (typeof field.options['default'] != 'undefined') {
                                try {
                                    this.$set(field.name, field.options['default']); // Should not throw
                                } catch (e) {
                                    throw Error("[INTERNAL] "+e);
                                }
                            }
                        }
                        // Set field values from a values object
                        if (arguments.length == 1 && typeof values == 'object' &&
                            /* not another Message */ typeof values.encode != 'function' &&
                            /* not a repeated field */ !ProtoBuf.Util.isArray(values) &&
                            /* not a ByteBuffer */ !(values instanceof ByteBuffer) &&
                            /* not an ArrayBuffer */ !(values instanceof ArrayBuffer) &&
                            /* not a Long */ !(ProtoBuf.Long && values instanceof ProtoBuf.Long)) {
                            var keys = Object.keys(values);
                            for (i=0; i<keys.length; i++)
                                this.$set(keys[i], values[keys[i]]); // May throw
                            // Else set field values from arguments, in correct order
                        } else
                            for (i=0; i<arguments.length; i++)
                                if (i<fields.length)
                                    this.$set(fields[i].name, arguments[i]); // May throw
                    };

                    // Extends ProtoBuf.Builder.Message
                    Message.prototype = Object.create(ProtoBuf.Builder.Message.prototype);

                    /**
                     * Adds a value to a repeated field.
                     * @name ProtoBuf.Builder.Message#add
                     * @function
                     * @param {string} key Field name
                     * @param {*} value Value to add
                     * @param {boolean=} noAssert Whether to assert the value or not (asserts by default)
                     * @throws {Error} If the value cannot be added
                     * @expose
                     */
                    Message.prototype.add = function(key, value, noAssert) {
                        var field = T.getChild(key);
                        if (!field)
                            throw Error(this+"#"+key+" is undefined");
                        if (!(field instanceof ProtoBuf.Reflect.Message.Field))
                            throw Error(this+"#"+key+" is not a field: "+field.toString(true)); // May throw if it's an enum or embedded message
                        if (!field.repeated)
                            throw Error(this+"#"+key+" is not a repeated field");
                        if (this[field.name] === null)
                            this[field.name] = [];
                        this[field.name].push(noAssert ? value : field.verifyValue(value, true));
                    };

                    /**
                     * Adds a value to a repeated field. This is an alias for {@link ProtoBuf.Builder.Message#add}.
                     * @name ProtoBuf.Builder.Message#$add
                     * @function
                     * @param {string} key Field name
                     * @param {*} value Value to add
                     * @param {boolean=} noAssert Whether to assert the value or not (asserts by default)
                     * @throws {Error} If the value cannot be added
                     * @expose
                     */
                    Message.prototype.$add = Message.prototype.add;

                    /**
                     * Sets a field's value.
                     * @name ProtoBuf.Builder.Message#set
                     * @function
                     * @param {string} key Key
                     * @param {*} value Value to set
                     * @param {boolean=} noAssert Whether to assert the value or not (asserts by default)
                     * @throws {Error} If the value cannot be set
                     * @expose
                     */
                    Message.prototype.set = function(key, value, noAssert) {
                        var field = T.getChild(key);
                        if (!field)
                            throw Error(this+"#"+key+" is not a field: undefined");
                        if (!(field instanceof ProtoBuf.Reflect.Message.Field))
                            throw Error(this+"#"+key+" is not a field: "+field.toString(true));
                        this[field.name] = noAssert ? value : field.verifyValue(value); // May throw
                    };

                    /**
                     * Sets a field's value. This is an alias for [@link ProtoBuf.Builder.Message#set}.
                     * @name ProtoBuf.Builder.Message#$set
                     * @function
                     * @param {string} key Key
                     * @param {*} value Value to set
                     * @param {boolean=} noAssert Whether to assert the value or not (asserts by default)
                     * @throws {Error} If the value cannot be set
                     * @expose
                     */
                    Message.prototype.$set = Message.prototype.set;

                    /**
                     * Gets a field's value.
                     * @name ProtoBuf.Builder.Message#get
                     * @function
                     * @param {string} key Key
                     * @return {*} Value
                     * @throws {Error} If there is no such field
                     * @expose
                     */
                    Message.prototype.get = function(key) {
                        var field = T.getChild(key);
                        if (!field || !(field instanceof ProtoBuf.Reflect.Message.Field))
                            throw Error(this+"#"+key+" is not a field: undefined");
                        if (!(field instanceof ProtoBuf.Reflect.Message.Field))
                            throw Error(this+"#"+key+" is not a field: "+field.toString(true));
                        return this[field.name];
                    };

                    /**
                     * Gets a field's value. This is an alias for {@link ProtoBuf.Builder.Message#$get}.
                     * @name ProtoBuf.Builder.Message#$get
                     * @function
                     * @param {string} key Key
                     * @return {*} Value
                     * @throws {Error} If there is no such field
                     * @expose
                     */
                    Message.prototype.$get = Message.prototype.get;

                    // Getters and setters

                    for (var i=0; i<fields.length; i++) {
                        var field = fields[i];

                        (function(field) {
                            // set/get[SomeValue]
                            var Name = field.originalName.replace(/(_[a-zA-Z])/g, function(match) {
                                return match.toUpperCase().replace('_','');
                            });
                            Name = Name.substring(0,1).toUpperCase()+Name.substring(1);

                            // set/get_[some_value]
                            var name = field.originalName.replace(/([A-Z])/g, function(match) {
                                return "_"+match;
                            });

                            /**
                             * Sets a value. This method is present for each field, but only if there is no name conflict with
                             * another field.
                             * @name ProtoBuf.Builder.Message#set[SomeField]
                             * @function
                             * @param {*} value Value to set
                             * @abstract
                             * @throws {Error} If the value cannot be set
                             */
                            if (!T.hasChild("set"+Name))
                                Message.prototype["set"+Name] = function(value) {
                                    this.$set(field.name, value);
                                };

                            /**
                             * Sets a value. This method is present for each field, but only if there is no name conflict with
                             * another field.
                             * @name ProtoBuf.Builder.Message#set_[some_field]
                             * @function
                             * @param {*} value Value to set
                             * @abstract
                             * @throws {Error} If the value cannot be set
                             */
                            if (!T.hasChild("set_"+name))
                                Message.prototype["set_"+name] = function(value) {
                                    this.$set(field.name, value);
                                };

                            /**
                             * Gets a value. This method is present for each field, but only if there is no name conflict with
                             * another field.
                             * @name ProtoBuf.Builder.Message#get[SomeField]
                             * @function
                             * @abstract
                             * @return {*} The value
                             */
                            if (!T.hasChild("get"+Name))
                                Message.prototype["get"+Name] = function() {
                                    return this.$get(field.name); // Does not throw, field exists
                                }

                            /**
                             * Gets a value. This method is present for each field, but only if there is no name conflict with
                             * another field.
                             * @name ProtoBuf.Builder.Message#get_[some_field]
                             * @function
                             * @return {*} The value
                             * @abstract
                             */
                            if (!T.hasChild("get_"+name))
                                Message.prototype["get_"+name] = function() {
                                    return this.$get(field.name); // Does not throw, field exists
                                };

                        })(field);
                    }

                    // En-/decoding

                    /**
                     * Encodes the message.
                     * @name ProtoBuf.Builder.Message#$encode
                     * @function
                     * @param {(!ByteBuffer|boolean)=} buffer ByteBuffer to encode to. Will create a new one and flip it if omitted.
                     * @return {!ByteBuffer} Encoded message as a ByteBuffer
                     * @throws {Error} If the message cannot be encoded or if required fields are missing. The later still
                     *  returns the encoded ByteBuffer in the `encoded` property on the error.
                     * @expose
                     * @see ProtoBuf.Builder.Message#encode64
                     * @see ProtoBuf.Builder.Message#encodeHex
                     * @see ProtoBuf.Builder.Message#encodeAB
                     */
                    Message.prototype.encode = function(buffer) {
                        var isNew = false;
                        if (!buffer)
                            buffer = new ByteBuffer(), isNew = true;
                        var le = buffer.littleEndian;
                        try {
                            T.encode(this, buffer.LE());
                            return (isNew ? buffer.flip() : buffer).LE(le);
                        } catch (e) {
                            buffer.LE(le);
                            throw(e);
                        }
                    };

                    /**
                     * Calculates the byte length of the message.
                     * @name ProtoBuf.Builder.Message#calculate
                     * @function
                     * @returns {number} Byte length
                     * @throws {Error} If the message cannot be calculated or if required fields are missing.
                     * @expose
                     */
                    Message.prototype.calculate = function() {
                        return T.calculate(this);
                    };

                    /**
                     * Encodes the varint32 length-delimited message.
                     * @name ProtoBuf.Builder.Message#encodeDelimited
                     * @function
                     * @param {(!ByteBuffer|boolean)=} buffer ByteBuffer to encode to. Will create a new one and flip it if omitted.
                     * @return {!ByteBuffer} Encoded message as a ByteBuffer
                     * @throws {Error} If the message cannot be encoded or if required fields are missing. The later still
                     *  returns the encoded ByteBuffer in the `encoded` property on the error.
                     * @expose
                     */
                    Message.prototype.encodeDelimited = function(buffer) {
                        var isNew = false;
                        if (!buffer)
                            buffer = new ByteBuffer(), isNew = true;
                        var enc = new ByteBuffer().LE();
                        T.encode(this, enc).flip();
                        buffer.writeVarint32(enc.remaining());
                        buffer.append(enc);
                        return isNew ? buffer.flip() : buffer;
                    };

                    /**
                     * Directly encodes the message to an ArrayBuffer.
                     * @name ProtoBuf.Builder.Message#encodeAB
                     * @function
                     * @return {ArrayBuffer} Encoded message as ArrayBuffer
                     * @throws {Error} If the message cannot be encoded or if required fields are missing. The later still
                     *  returns the encoded ArrayBuffer in the `encoded` property on the error.
                     * @expose
                     */
                    Message.prototype.encodeAB = function() {
                        try {
                            return this.encode().toArrayBuffer();
                        } catch (e) {
                            if (e["encoded"]) e["encoded"] = e["encoded"].toArrayBuffer();
                            throw(e);
                        }
                    };

                    /**
                     * Returns the message as an ArrayBuffer. This is an alias for {@link ProtoBuf.Builder.Message#encodeAB}.
                     * @name ProtoBuf.Builder.Message#toArrayBuffer
                     * @function
                     * @return {ArrayBuffer} Encoded message as ArrayBuffer
                     * @throws {Error} If the message cannot be encoded or if required fields are missing. The later still
                     *  returns the encoded ArrayBuffer in the `encoded` property on the error.
                     * @expose
                     */
                    Message.prototype.toArrayBuffer = Message.prototype.encodeAB;

                    /**
                     * Directly encodes the message to a node Buffer.
                     * @name ProtoBuf.Builder.Message#encodeNB
                     * @function
                     * @return {!Buffer}
                     * @throws {Error} If the message cannot be encoded, not running under node.js or if required fields are
                     *  missing. The later still returns the encoded node Buffer in the `encoded` property on the error.
                     * @expose
                     */
                    Message.prototype.encodeNB = function() {
                        try {
                            return this.encode().toBuffer();
                        } catch (e) {
                            if (e["encoded"]) e["encoded"] = e["encoded"].toBuffer();
                            throw(e);
                        }
                    };

                    /**
                     * Returns the message as a node Buffer. This is an alias for {@link ProtoBuf.Builder.Message#encodeNB}.
                     * @name ProtoBuf.Builder.Message#toBuffer
                     * @function
                     * @return {!Buffer}
                     * @throws {Error} If the message cannot be encoded or if required fields are missing. The later still
                     *  returns the encoded node Buffer in the `encoded` property on the error.
                     * @expose
                     */
                    Message.prototype.toBuffer = Message.prototype.encodeNB;

                    /**
                     * Directly encodes the message to a base64 encoded string.
                     * @name ProtoBuf.Builder.Message#encode64
                     * @function
                     * @return {string} Base64 encoded string
                     * @throws {Error} If the underlying buffer cannot be encoded or if required fields are missing. The later
                     *  still returns the encoded base64 string in the `encoded` property on the error.
                     * @expose
                     */
                    Message.prototype.encode64 = function() {
                        try {
                            return this.encode().toBase64();
                        } catch (e) {
                            if (e["encoded"]) e["encoded"] = e["encoded"].toBase64();
                            throw(e);
                        }
                    };

                    /**
                     * Returns the message as a base64 encoded string. This is an alias for {@link ProtoBuf.Builder.Message#encode64}.
                     * @name ProtoBuf.Builder.Message#toBase64
                     * @function
                     * @return {string} Base64 encoded string
                     * @throws {Error} If the message cannot be encoded or if required fields are missing. The later still
                     *  returns the encoded base64 string in the `encoded` property on the error.
                     * @expose
                     */
                    Message.prototype.toBase64 = Message.prototype.encode64;

                    /**
                     * Directly encodes the message to a hex encoded string.
                     * @name ProtoBuf.Builder.Message#encodeHex
                     * @function
                     * @return {string} Hex encoded string
                     * @throws {Error} If the underlying buffer cannot be encoded or if required fields are missing. The later
                     *  still returns the encoded hex string in the `encoded` property on the error.
                     * @expose
                     */
                    Message.prototype.encodeHex = function() {
                        try {
                            return this.encode().toHex();
                        } catch (e) {
                            if (e["encoded"]) e["encoded"] = e["encoded"].toHex();
                            throw(e);
                        }
                    };

                    /**
                     * Returns the message as a hex encoded string. This is an alias for {@link ProtoBuf.Builder.Message#encodeHex}.
                     * @name ProtoBuf.Builder.Message#toHex
                     * @function
                     * @return {string} Hex encoded string
                     * @throws {Error} If the message cannot be encoded or if required fields are missing. The later still
                     *  returns the encoded hex string in the `encoded` property on the error.
                     * @expose
                     */
                    Message.prototype.toHex = Message.prototype.encodeHex;

                    /**
                     * Clones a message object to a raw object.
                     * @param {*} obj Object to clone
                     * @param {boolean} includeBuffers Whether to include native buffer data or not
                     * @returns {*} Cloned object
                     * @inner
                     */
                    function cloneRaw(obj, includeBuffers) {
                        var clone = {};
                        for (var i in obj)
                            if (obj.hasOwnProperty(i)) {
                                if (obj[i] === null || typeof obj[i] !== 'object')
                                    clone[i] = obj[i];
                                else if (obj[i] instanceof ByteBuffer) {
                                    if (includeBuffers)
                                        clone[i] = obj.toBuffer();
                                } else // is a non-null object
                                    clone[i] = cloneRaw(obj[i], includeBuffers);
                            }
                        return clone;
                    }

                    /**
                     * Returns the message's raw payload.
                     * @param {boolean=} includeBuffers Whether to include native buffer data or not, defaults to `false`
                     * @returns {Object.<string,*>} Raw payload
                     * @expose
                     */
                    Message.prototype.toRaw = function(includeBuffers) {
                        return cloneRaw(this, !!includeBuffers);
                    };

                    /**
                     * Decodes a message from the specified buffer or string.
                     * @name ProtoBuf.Builder.Message.decode
                     * @function
                     * @param {!ByteBuffer|!ArrayBuffer|!Buffer|string} buffer Buffer to decode from
                     * @param {string=} enc Encoding if buffer is a string: hex, utf8 (not recommended), defaults to base64
                     * @return {!ProtoBuf.Builder.Message} Decoded message
                     * @throws {Error} If the message cannot be decoded or if required fields are missing. The later still
                     *  returns the decoded message with missing fields in the `decoded` property on the error.
                     * @expose
                     * @see ProtoBuf.Builder.Message.decode64
                     * @see ProtoBuf.Builder.Message.decodeHex
                     */
                    Message.decode = function(buffer, enc) {
                        if (typeof buffer === 'string')
                            buffer = ByteBuffer.wrap(buffer, enc ? enc : "base64");
                        buffer = buffer instanceof ByteBuffer ? buffer : ByteBuffer.wrap(buffer); // May throw
                        var le = buffer.littleEndian;
                        try {
                            var msg = T.decode(buffer.LE());
                            buffer.LE(le);
                            return msg;
                        } catch (e) {
                            buffer.LE(le);
                            throw(e);
                        }
                    };

                    /**
                     * Decodes a varint32 length-delimited message from the specified buffer or string.
                     * @name ProtoBuf.Builder.Message.decodeDelimited
                     * @function
                     * @param {!ByteBuffer|!ArrayBuffer|!Buffer|string} buffer Buffer to decode from
                     * @param {string=} enc Encoding if buffer is a string: hex, utf8 (not recommended), defaults to base64
                     * @return {ProtoBuf.Builder.Message} Decoded message or `null` if not enough bytes are available yet
                     * @throws {Error} If the message cannot be decoded or if required fields are missing. The later still
                     *  returns the decoded message with missing fields in the `decoded` property on the error.
                     * @expose
                     */
                    Message.decodeDelimited = function(buffer, enc) {
                        if (typeof buffer === 'string')
                            buffer = ByteBuffer.wrap(buffer, enc ? enc : "base64");
                        buffer = buffer instanceof ByteBuffer ? buffer : ByteBuffer.wrap(buffer); // May throw
                        if (buffer.remaining() < 1)
                            return null;
                        var off = buffer.offset,
                            len = buffer.readVarint32();
                        if (buffer.remaining() < len) {
                            buffer.offset = off;
                            return null;
                        }
                        try {
                            var msg = T.decode(buffer.slice(buffer.offset, buffer.offset + len).LE());
                            buffer.offset += len;
                            return msg;
                        } catch (err) {
                            buffer.offset += len;
                            throw err;
                        }
                    };

                    /**
                     * Decodes the message from the specified base64 encoded string.
                     * @name ProtoBuf.Builder.Message.decode64
                     * @function
                     * @param {string} str String to decode from
                     * @return {!ProtoBuf.Builder.Message} Decoded message
                     * @throws {Error} If the message cannot be decoded or if required fields are missing. The later still
                     *  returns the decoded message with missing fields in the `decoded` property on the error.
                     * @expose
                     */
                    Message.decode64 = function(str) {
                        return Message.decode(str, "base64");
                    };

                    /**
                     * Decodes the message from the specified hex encoded string.
                     * @name ProtoBuf.Builder.Message.decodeHex
                     * @function
                     * @param {string} str String to decode from
                     * @return {!ProtoBuf.Builder.Message} Decoded message
                     * @throws {Error} If the message cannot be decoded or if required fields are missing. The later still
                     *  returns the decoded message with missing fields in the `decoded` property on the error.
                     * @expose
                     */
                    Message.decodeHex = function(str) {
                        return Message.decode(str, "hex");
                    };

                    // Utility

                    /**
                     * Returns a string representation of this Message.
                     * @name ProtoBuf.Builder.Message#toString
                     * @function
                     * @return {string} String representation as of ".Fully.Qualified.MessageName"
                     * @expose
                     */
                    Message.prototype.toString = function() {
                        return T.toString();
                    };

                    // Static

                    /**
                     * Options.
                     * @name ProtoBuf.Builder.Message.$options
                     * @type {Object.<string,*>}
                     * @expose
                     */
                    var $options; // for cc

                    if (Object.defineProperty)
                        Object.defineProperty(Message, '$options', { "value": T.buildOpt() });

                    return Message;

                })(ProtoBuf, this);

                // Static enums and prototyped sub-messages
                var children = this.getChildren();
                for (var i=0; i<children.length; i++) {
                    if (children[i] instanceof Enum)
                        clazz[children[i]['name']] = children[i].build();
                    else if (children[i] instanceof Message)
                        clazz[children[i]['name']] = children[i].build();
                    else if (children[i] instanceof Message.Field) {
                        // Ignore
                    } else
                        throw Error("Illegal reflect child of "+this.toString(true)+": "+children[i].toString(true));
                }
                return this.clazz = clazz;
            };

            /**
             * Encodes a runtime message's contents to the specified buffer.
             * @param {!ProtoBuf.Builder.Message} message Runtime message to encode
             * @param {ByteBuffer} buffer ByteBuffer to write to
             * @return {ByteBuffer} The ByteBuffer for chaining
             * @throws {Error} If required fields are missing or the message cannot be encoded for another reason
             * @expose
             */
            Message.prototype.encode = function(message, buffer) {
                var fields = this.getChildren(Message.Field),
                    fieldMissing = null;
                for (var i=0, val; i<fields.length; i++) {
                    val = message.$get(fields[i].name);
                    if (fields[i].required && val === null) {
                        if (fieldMissing === null)
                            fieldMissing = fields[i];
                    } else
                        fields[i].encode(val, buffer);
                }
                if (fieldMissing !== null) {
                    var err = Error("Missing at least one required field for "+this.toString(true)+": "+fieldMissing);
                    err["encoded"] = buffer; // Still expose what we got
                    throw(err);
                }
                return buffer;
            };

            /**
             * Calculates a runtime message's byte length.
             * @param {!ProtoBuf.Builder.Message} message Runtime message to encode
             * @returns {number} Byte length
             * @throws {Error} If required fields are missing or the message cannot be calculated for another reason
             * @expose
             */
            Message.prototype.calculate = function(message) {
                var fields = this.getChildren(Message.Field),
                    n = 0;
                for (var i=0, val; i<fields.length; i++) {
                    val = message.$get(fields[i].name);
                    if (fields[i].required && val === null)
                       throw Error("Missing at least one required field for "+this.toString(true)+": "+fields[i]);
                    else
                        n += fields[i].calculate(val);
                }
                return n;
            };

            /**
             * Skips all data until the end of the specified group has been reached.
             * @param {number} expectedId Expected GROUPEND id
             * @param {!ByteBuffer} buf ByteBuffer
             * @returns {boolean} `true` if a value as been skipped, `false` if the end has been reached
             * @throws {Error} If it wasn't possible to find the end of the group (buffer overrun or end tag mismatch)
             * @inner
             */
            function skipTillGroupEnd(expectedId, buf) {
                var tag = buf.readVarint32(), // Throws on OOB
                    wireType = tag & 0x07,
                    id = tag >> 3;
                switch (wireType) {
                    case ProtoBuf.WIRE_TYPES.VARINT:
                        do tag = buf.readUint8();
                        while ((tag & 0x80) === 0x80);
                        break;
                    case ProtoBuf.WIRE_TYPES.BITS64:
                        buf.offset += 8;
                        break;
                    case ProtoBuf.WIRE_TYPES.LDELIM:
                        tag = buf.readVarint32(); // reads the varint
                        buf.offset += tag;        // skips n bytes
                        break;
                    case ProtoBuf.WIRE_TYPES.STARTGROUP:
                        skipTillGroupEnd(id, buf);
                        break;
                    case ProtoBuf.WIRE_TYPES.ENDGROUP:
                        if (id === expectedId)
                            return false;
                        else
                            throw Error("Illegal GROUPEND after unknown group: "+id+" ("+expectedId+" expected)");
                    case ProtoBuf.WIRE_TYPES.BITS32:
                        buf.offset += 4;
                        break;
                    default:
                        throw Error("Illegal wire type in unknown group "+expectedId+": "+wireType);
                }
                return true;
            }

            /**
             * Decodes an encoded message and returns the decoded message.
             * @param {ByteBuffer} buffer ByteBuffer to decode from
             * @param {number=} length Message length. Defaults to decode all the available data.
             * @param {number=} expectedGroupEndId Expected GROUPEND id if this is a legacy group
             * @return {ProtoBuf.Builder.Message} Decoded message
             * @throws {Error} If the message cannot be decoded
             * @expose
             */
            Message.prototype.decode = function(buffer, length, expectedGroupEndId) {
                length = typeof length === 'number' ? length : -1;
                var start = buffer.offset;
                var msg = new (this.clazz)();
                var tag, wireType, id;
                while (buffer.offset < start+length || (length == -1 && buffer.remaining() > 0)) {
                    tag = buffer.readVarint32();
                    wireType = tag & 0x07;
                    id = tag >> 3;
                    if (wireType === ProtoBuf.WIRE_TYPES.ENDGROUP) {
                        if (id !== expectedGroupEndId)
                            throw Error("Illegal group end indicator for "+this.toString(true)+": "+id+" ("+(expectedGroupEndId ? expectedGroupEndId+" expected" : "not a group")+")");
                        break;
                    }
                    var field = this.getChild(id); // Message.Field only
                    if (!field) {
                        // "messages created by your new code can be parsed by your old code: old binaries simply ignore the new field when parsing."
                        switch (wireType) {
                            case ProtoBuf.WIRE_TYPES.VARINT:
                                buffer.readVarint32();
                                break;
                            case ProtoBuf.WIRE_TYPES.BITS32:
                                buffer.offset += 4;
                                break;
                            case ProtoBuf.WIRE_TYPES.BITS64:
                                buffer.offset += 8;
                                break;
                            case ProtoBuf.WIRE_TYPES.LDELIM:
                                var len = buffer.readVarint32();
                                buffer.offset += len;
                                break;
                            case ProtoBuf.WIRE_TYPES.STARTGROUP:
                                while (skipTillGroupEnd(id, buffer)) {}
                                break;
                            default:
                                throw Error("Illegal wire type for unknown field "+id+" in "+this.toString(true)+"#decode: "+wireType);
                        }
                        continue;
                    }
                    if (field.repeated && !field.options["packed"])
                        msg.$add(field.name, field.decode(wireType, buffer), true);
                    else
                        msg.$set(field.name, field.decode(wireType, buffer), true);
                }

                // Check if all required fields are present
                var fields = this.getChildren(ProtoBuf.Reflect.Field);
                for (var i=0; i<fields.length; i++)
                    if (fields[i].required && msg[fields[i].name] === null) {
                        var err = Error("Missing at least one required field for "+this.toString(true)+": "+fields[i].name);
                        err["decoded"] = msg; // Still expose what we got
                        throw(err);
                    }
                return msg;
            };

            /**
             * @alias ProtoBuf.Reflect.Message
             * @expose
             */
            Reflect.Message = Message;

            /**
             * Constructs a new Message Field.
             * @exports ProtoBuf.Reflect.Message.Field
             * @param {ProtoBuf.Reflect.Message} message Message reference
             * @param {string} rule Rule, one of requried, optional, repeated
             * @param {string} type Data type, e.g. int32
             * @param {string} name Field name
             * @param {number} id Unique field id
             * @param {Object.<string.*>=} options Options
             * @constructor
             * @extends ProtoBuf.Reflect.T
             */
            var Field = function(message, rule, type, name, id, options) {
                T.call(this, message, name);

                /**
                 * @override
                 */
                this.className = "Message.Field";

                /**
                 * Message field required flag.
                 * @type {boolean}
                 * @expose
                 */
                this.required = rule == "required";

                /**
                 * Message field repeated flag.
                 * @type {boolean}
                 * @expose
                 */
                this.repeated = rule == "repeated";

                /**
                 * Message field type. Type reference string if unresolved, protobuf type if resolved.
                 * @type {string|{name: string, wireType: number}}
                 * @expose
                 */
                this.type = type;

                /**
                 * Resolved type reference inside the global namespace.
                 * @type {ProtoBuf.Reflect.T|null}
                 * @expose
                 */
                this.resolvedType = null;

                /**
                 * Unique message field id.
                 * @type {number}
                 * @expose
                 */
                this.id = id;

                /**
                 * Message field options.
                 * @type {!Object.<string,*>}
                 * @dict
                 * @expose
                 */
                this.options = options || {};

                /**
                 * Original field name.
                 * @type {string}
                 * @expose
                 */
                this.originalName = this.name; // Used to revert camelcase transformation on naming collisions

                // Convert field names to camel case notation if the override is set
                if (ProtoBuf.convertFieldsToCamelCase) {
                    this.name = this.name.replace(/_([a-zA-Z])/g, function($0, $1) {
                        return $1.toUpperCase();
                    });
                }
            };

            // Extends T
            Field.prototype = Object.create(T.prototype);

            /**
             * Makes a Long from a value.
             * @param {{low: number, high: number, unsigned: boolean}|string|number} value Value
             * @param {boolean=} unsigned Whether unsigned or not, defaults to reuse it from Long-like objects or to signed for
             *  strings and numbers
             * @returns {!Long}
             * @throws {Error} If the value cannot be converted to a Long
             * @inner
             */
            function mkLong(value, unsigned) {
                if (value && typeof value.low === 'number' && typeof value.high === 'number' && typeof value.unsigned === 'boolean'
                    && value.low === value.low && value.high === value.high)
                    return new ProtoBuf.Long(value.low, value.high, typeof unsigned === 'undefined' ? value.unsigned : unsigned);
                if (typeof value === 'string')
                    return ProtoBuf.Long.fromString(value, unsigned || false, 10);
                if (typeof value === 'number')
                    return ProtoBuf.Long.fromNumber(value, unsigned || false);
                throw Error("not convertible to Long");
            }

            /**
             * Checks if the given value can be set for this field.
             * @param {*} value Value to check
             * @param {boolean=} skipRepeated Whether to skip the repeated value check or not. Defaults to false.
             * @return {*} Verified, maybe adjusted, value
             * @throws {Error} If the value cannot be set for this field
             * @expose
             */
            Field.prototype.verifyValue = function(value, skipRepeated) {
                skipRepeated = skipRepeated || false;
                var fail = function(val, msg) {
                    throw Error("Illegal value for "+this.toString(true)+" of type "+this.type.name+": "+val+" ("+msg+")");
                }.bind(this);
                if (value === null) { // NULL values for optional fields
                    if (this.required)
                        fail(typeof value, "required");
                    return null;
                }
                var i;
                if (this.repeated && !skipRepeated) { // Repeated values as arrays
                    if (!ProtoBuf.Util.isArray(value))
                        value = [value];
                    var res = [];
                    for (i=0; i<value.length; i++)
                        res.push(this.verifyValue(value[i], true));
                    return res;
                }
                // All non-repeated fields expect no array
                if (!this.repeated && ProtoBuf.Util.isArray(value))
                    fail(typeof value, "no array expected");

                switch (this.type) {
                    // Signed 32bit
                    case ProtoBuf.TYPES["int32"]:
                    case ProtoBuf.TYPES["sint32"]:
                    case ProtoBuf.TYPES["sfixed32"]:
                        // Account for !NaN: value === value
                        if (typeof value !== 'number' || (value === value && value % 1 !== 0))
                            fail(typeof value, "not an integer");
                        return value > 4294967295 ? value | 0 : value;

                    // Unsigned 32bit
                    case ProtoBuf.TYPES["uint32"]:
                    case ProtoBuf.TYPES["fixed32"]:
                        if (typeof value !== 'number' || (value === value && value % 1 !== 0))
                            fail(typeof value, "not an integer");
                        return value < 0 ? value >>> 0 : value;

                    // Signed 64bit
                    case ProtoBuf.TYPES["int64"]:
                    case ProtoBuf.TYPES["sint64"]:
                    case ProtoBuf.TYPES["sfixed64"]: {
                        if (ProtoBuf.Long)
                            try {
                                return mkLong(value, false);
                            } catch (e) {
                                fail(typeof value, e.message);
                            }
                        else
                            fail(typeof value, "requires Long.js");
                    }

                    // Unsigned 64bit
                    case ProtoBuf.TYPES["uint64"]:
                    case ProtoBuf.TYPES["fixed64"]: {
                        if (ProtoBuf.Long)
                            try {
                                return mkLong(value, true);
                            } catch (e) {
                                fail(typeof value, e.message);
                            }
                        else
                            fail(typeof value, "requires Long.js");
                    }

                    // Bool
                    case ProtoBuf.TYPES["bool"]:
                        if (typeof value !== 'boolean')
                            fail(typeof value, "not a boolean");
                        return value;

                    // Float
                    case ProtoBuf.TYPES["float"]:
                    case ProtoBuf.TYPES["double"]:
                        if (typeof value !== 'number')
                            fail(typeof value, "not a number");
                        return value;

                    // Length-delimited string
                    case ProtoBuf.TYPES["string"]:
                        if (typeof value !== 'string' && !(value && value instanceof String))
                            fail(typeof value, "not a string");
                        return ""+value; // Convert String object to string

                    // Length-delimited bytes
                    case ProtoBuf.TYPES["bytes"]:
                        return value && value instanceof ByteBuffer
                            ? value
                            : ByteBuffer.wrap(value);

                    // Constant enum value
                    case ProtoBuf.TYPES["enum"]: {
                        var values = this.resolvedType.getChildren(Enum.Value);
                        for (i=0; i<values.length; i++) {
                            if (values[i].name == value) {
                                return values[i].id;
                            } else if (values[i].id == value) {
                                return values[i].id;
                            }
                        }
                        fail(value, "not a valid enum value");
                    }
                    // Embedded message
                    case ProtoBuf.TYPES["group"]:
                    case ProtoBuf.TYPES["message"]: {
                        if (!value || typeof value !== 'object')
                            fail(typeof value, "object expected");
                        if (value instanceof this.resolvedType.clazz)
                            return value;
                        // Else let's try to construct one from a key-value object
                        return new (this.resolvedType.clazz)(value); // May throw for a hundred of reasons
                    }
                }

                // We should never end here
                throw Error("[INTERNAL] Illegal value for "+this.toString(true)+": "+value+" (undefined type "+this.type+")");
            };

            /**
             * Encodes the specified field value to the specified buffer.
             * @param {*} value Field value
             * @param {ByteBuffer} buffer ByteBuffer to encode to
             * @return {ByteBuffer} The ByteBuffer for chaining
             * @throws {Error} If the field cannot be encoded
             * @expose
             */
            Field.prototype.encode = function(value, buffer) {
                value = this.verifyValue(value); // May throw
                if (this.type === null || typeof this.type !== 'object')
                    throw Error("[INTERNAL] Unresolved type in "+this.toString(true)+": "+this.type);
                if (value === null || (this.repeated && value.length == 0))
                    return buffer; // Optional omitted
                try {
                    if (this.repeated) {
                        var i;
                        // "Only repeated fields of primitive numeric types (types which use the varint, 32-bit, or 64-bit wire
                        // types) can be declared 'packed'."
                        if (this.options["packed"] && ProtoBuf.PACKABLE_WIRE_TYPES.indexOf(this.type.wireType) >= 0) {
                            // "All of the elements of the field are packed into a single key-value pair with wire type 2
                            // (length-delimited). Each element is encoded the same way it would be normally, except without a
                            // tag preceding it."
                            buffer.writeVarint32((this.id << 3) | ProtoBuf.WIRE_TYPES.LDELIM);
                            buffer.ensureCapacity(buffer.offset += 1); // We do not know the length yet, so let's assume a varint of length 1
                            var start = buffer.offset; // Remember where the contents begin
                            for (i=0; i<value.length; i++)
                                this.encodeValue(value[i], buffer);
                            var len = buffer.offset-start;
                            var varintLen = ByteBuffer.calculateVarint32(len);
                            if (varintLen > 1) { // We need to move the contents
                                var contents = buffer.slice(start, buffer.offset);
                                start += varintLen-1;
                                buffer.offset = start;
                                buffer.append(contents);
                            }
                            buffer.writeVarint32(len, start-varintLen);
                        } else {
                            // "If your message definition has repeated elements (without the [packed=true] option), the encoded
                            // message has zero or more key-value pairs with the same tag number"
                            for (i=0; i<value.length; i++)
                                buffer.writeVarint32((this.id << 3) | this.type.wireType),
                                this.encodeValue(value[i], buffer);
                        }
                    } else
                        buffer.writeVarint32((this.id << 3) | this.type.wireType),
                        this.encodeValue(value, buffer);
                } catch (e) {
                    throw Error("Illegal value for "+this.toString(true)+": "+value+" ("+e+")");
                }
                return buffer;
            };

            /**
             * Encodes a value to the specified buffer. Does not encode the key.
             * @param {*} value Field value
             * @param {ByteBuffer} buffer ByteBuffer to encode to
             * @return {ByteBuffer} The ByteBuffer for chaining
             * @throws {Error} If the value cannot be encoded
             * @expose
             */
            Field.prototype.encodeValue = function(value, buffer) {
                if (value === null) return buffer; // Nothing to encode
                // Tag has already been written

                switch (this.type) {
                    // 32bit signed varint
                    case ProtoBuf.TYPES["int32"]:
                        // "If you use int32 or int64 as the type for a negative number, the resulting varint is always ten bytes
                        // long – it is, effectively, treated like a very large unsigned integer." (see #122)
                        if (value < 0)
                            buffer.writeVarint64(value);
                        else
                            buffer.writeVarint32(value);
                        break;

                    // 32bit unsigned varint
                    case ProtoBuf.TYPES["uint32"]:
                        buffer.writeVarint32(value);
                        break;

                    // 32bit varint zig-zag
                    case ProtoBuf.TYPES["sint32"]:
                        buffer.writeVarint32ZigZag(value);
                        break;

                    // Fixed unsigned 32bit
                    case ProtoBuf.TYPES["fixed32"]:
                        buffer.writeUint32(value);
                        break;

                    // Fixed signed 32bit
                    case ProtoBuf.TYPES["sfixed32"]:
                        buffer.writeInt32(value);
                        break;

                    // 64bit varint as-is
                    case ProtoBuf.TYPES["int64"]:
                    case ProtoBuf.TYPES["uint64"]:
                        buffer.writeVarint64(value); // throws
                        break;

                    // 64bit varint zig-zag
                    case ProtoBuf.TYPES["sint64"]:
                        buffer.writeVarint64ZigZag(value); // throws
                        break;

                    // Fixed unsigned 64bit
                    case ProtoBuf.TYPES["fixed64"]:
                        buffer.writeUint64(value); // throws
                        break;

                    // Fixed signed 64bit
                    case ProtoBuf.TYPES["sfixed64"]:
                        buffer.writeInt64(value); // throws
                        break;

                    // Bool
                    case ProtoBuf.TYPES["bool"]:
                        if (typeof value === 'string')
                            buffer.writeVarint32(value.toLowerCase() === 'false' ? 0 : !!value);
                        else
                            buffer.writeVarint32(value ? 1 : 0);
                        break;

                    // Constant enum value
                    case ProtoBuf.TYPES["enum"]:
                        buffer.writeVarint32(value);
                        break;

                    // 32bit float
                    case ProtoBuf.TYPES["float"]:
                        buffer.writeFloat32(value);
                        break;

                    // 64bit float
                    case ProtoBuf.TYPES["double"]:
                        buffer.writeFloat64(value);
                        break;

                    // Length-delimited string
                    case ProtoBuf.TYPES["string"]:
                        buffer.writeVString(value);
                        break;

                    // Length-delimited bytes
                    case ProtoBuf.TYPES["bytes"]:
                        if (value.remaining() < 0)
                            throw Error("Illegal value for "+this.toString(true)+": "+value.remaining()+" bytes remaining");
                        var prevOffset = value.offset;
                        buffer.writeVarint32(value.remaining());
                        buffer.append(value);
                        value.offset = prevOffset;
                        break;

                    // Embedded message
                    case ProtoBuf.TYPES["message"]:
                        var bb = new ByteBuffer().LE();
                        this.resolvedType.encode(value, bb);
                        buffer.writeVarint32(bb.offset);
                        buffer.append(bb.flip());
                        break;

                    // Legacy group
                    case ProtoBuf.TYPES["group"]:
                        this.resolvedType.encode(value, buffer);
                        buffer.writeVarint32((this.id << 3) | ProtoBuf.WIRE_TYPES.ENDGROUP);
                        break;

                    default:
                        // We should never end here
                        throw Error("[INTERNAL] Illegal value to encode in "+this.toString(true)+": "+value+" (unknown type)");
                }
                return buffer;
            };

            /**
             * Calculates the length of this field's value on the network level.
             * @param {*} value Field value
             * @returns {number} Byte length
             * @expose
             */
            Field.prototype.calculate = function(value) {
                value = this.verifyValue(value); // May throw
                if (this.type === null || typeof this.type !== 'object')
                    throw Error("[INTERNAL] Unresolved type in "+this.toString(true)+": "+this.type);
                if (value === null || (this.repeated && value.length == 0))
                    return 0; // Optional omitted
                var n = 0;
                try {
                    if (this.repeated) {
                        var i, ni;
                        if (this.options["packed"] && ProtoBuf.PACKABLE_WIRE_TYPES.indexOf(this.type.wireType) >= 0) {
                            n += ByteBuffer.calculateVarint32((this.id << 3) | ProtoBuf.WIRE_TYPES.LDELIM);
                            ni = 0;
                            for (i=0; i<value.length; i++)
                                ni += this.calculateValue(value[i]);
                            n += ByteBuffer.calculateVarint32(ni);
                            n += ni;
                        } else {
                            for (i=0; i<value.length; i++)
                                n += ByteBuffer.calculateVarint32((this.id << 3) | this.type.wireType),
                                n += this.calculateValue(value[i]);
                        }
                    } else {
                        n += ByteBuffer.calculateVarint32((this.id << 3) | this.type.wireType);
                        n += this.calculateValue(value);
                    }
                } catch (e) {
                    throw Error("Illegal value for "+this.toString(true)+": "+value+" ("+e+")");
                }
                return n;
            };

            /**
             * Calculates the byte length of a value.
             * @param {*} value Field value
             * @returns {number} Byte length
             * @throws {Error} If the value cannot be calculated
             * @expose
             */
            Field.prototype.calculateValue = function(value) {
                if (value === null) return 0; // Nothing to encode
                // Tag has already been written
                var n;
                switch (this.type) {
                    case ProtoBuf.TYPES["int32"]:
                        return value < 0 ? ByteBuffer.calculateVarint64(value) : ByteBuffer.calculateVarint32(value);
                    case ProtoBuf.TYPES["uint32"]:
                        return ByteBuffer.calculateVarint32(value);
                    case ProtoBuf.TYPES["sint32"]:
                        return ByteBuffer.calculateVarint32(ByteBuffer.zigZagEncode32(value));
                    case ProtoBuf.TYPES["fixed32"]:
                    case ProtoBuf.TYPES["sfixed32"]:
                    case ProtoBuf.TYPES["float"]:
                        return 4;
                    case ProtoBuf.TYPES["int64"]:
                    case ProtoBuf.TYPES["uint64"]:
                        return ByteBuffer.calculateVarint64(value);
                    case ProtoBuf.TYPES["sint64"]:
                        return ByteBuffer.calculateVarint64(ByteBuffer.zigZagEncode64(value));
                    case ProtoBuf.TYPES["fixed64"]:
                    case ProtoBuf.TYPES["sfixed64"]:
                        return 8;
                    case ProtoBuf.TYPES["bool"]:
                        return 1;
                    case ProtoBuf.TYPES["enum"]:
                        return ByteBuffer.calculateVarint32(value);
                    case ProtoBuf.TYPES["double"]:
                        return 8;
                    case ProtoBuf.TYPES["string"]:
                        n = ByteBuffer.calculateUTF8Bytes(value);
                        return ByteBuffer.calculateVarint32(n) + n;
                    case ProtoBuf.TYPES["bytes"]:
                        if (value.remaining() < 0)
                            throw Error("Illegal value for "+this.toString(true)+": "+value.remaining()+" bytes remaining");
                        return ByteBuffer.calculateVarint32(value.remaining()) + value.remaining();
                    case ProtoBuf.TYPES["message"]:
                        n = this.resolvedType.calculate(value);
                        return ByteBuffer.calculateVarint32(n) + n;
                    case ProtoBuf.TYPES["group"]:
                        n = this.resolvedType.calculate(value);
                        return n + ByteBuffer.calculateVarint32((this.id << 3) | ProtoBuf.WIRE_TYPES.ENDGROUP);
                }
                // We should never end here
                throw Error("[INTERNAL] Illegal value to encode in "+this.toString(true)+": "+value+" (unknown type)");
            };

            /**
             * Decode the field value from the specified buffer.
             * @param {number} wireType Leading wire type
             * @param {ByteBuffer} buffer ByteBuffer to decode from
             * @param {boolean=} skipRepeated Whether to skip the repeated check or not. Defaults to false.
             * @return {*} Decoded value
             * @throws {Error} If the field cannot be decoded
             * @expose
             */
            Field.prototype.decode = function(wireType, buffer, skipRepeated) {
                var value, nBytes;
                if (wireType != this.type.wireType && (skipRepeated || (wireType != ProtoBuf.WIRE_TYPES.LDELIM || !this.repeated)))
                    throw Error("Illegal wire type for field "+this.toString(true)+": "+wireType+" ("+this.type.wireType+" expected)");
                if (wireType == ProtoBuf.WIRE_TYPES.LDELIM && this.repeated && this.options["packed"] && ProtoBuf.PACKABLE_WIRE_TYPES.indexOf(this.type.wireType) >= 0) {
                    if (!skipRepeated) {
                        nBytes = buffer.readVarint32();
                        nBytes = buffer.offset + nBytes; // Limit
                        var values = [];
                        while (buffer.offset < nBytes)
                            values.push(this.decode(this.type.wireType, buffer, true));
                        return values;
                    }
                    // Read the next value otherwise...
                }
                switch (this.type) {
                    // 32bit signed varint
                    case ProtoBuf.TYPES["int32"]:
                        return buffer.readVarint32() | 0;

                    // 32bit unsigned varint
                    case ProtoBuf.TYPES["uint32"]:
                        return buffer.readVarint32() >>> 0;

                    // 32bit signed varint zig-zag
                    case ProtoBuf.TYPES["sint32"]:
                        return buffer.readVarint32ZigZag() | 0;

                    // Fixed 32bit unsigned
                    case ProtoBuf.TYPES["fixed32"]:
                        return buffer.readUint32() >>> 0;

                    case ProtoBuf.TYPES["sfixed32"]:
                        return buffer.readInt32() | 0;

                    // 64bit signed varint
                    case ProtoBuf.TYPES["int64"]:
                        return buffer.readVarint64();

                    // 64bit unsigned varint
                    case ProtoBuf.TYPES["uint64"]:
                        return buffer.readVarint64().toUnsigned();

                    // 64bit signed varint zig-zag
                    case ProtoBuf.TYPES["sint64"]:
                        return buffer.readVarint64ZigZag();

                    // Fixed 64bit unsigned
                    case ProtoBuf.TYPES["fixed64"]:
                        return buffer.readUint64();

                    // Fixed 64bit signed
                    case ProtoBuf.TYPES["sfixed64"]:
                        return buffer.readInt64();

                    // Bool varint
                    case ProtoBuf.TYPES["bool"]:
                        return !!buffer.readVarint32();

                    // Constant enum value (varint)
                    case ProtoBuf.TYPES["enum"]:
                        // The following Builder.Message#set will already throw
                        return buffer.readVarint32();

                    // 32bit float
                    case ProtoBuf.TYPES["float"]:
                        return buffer.readFloat();

                    // 64bit float
                    case ProtoBuf.TYPES["double"]:
                        return buffer.readDouble();

                    // Length-delimited string
                    case ProtoBuf.TYPES["string"]:
                        return buffer.readVString();

                    // Length-delimited bytes
                    case ProtoBuf.TYPES["bytes"]: {
                        nBytes = buffer.readVarint32();
                        if (buffer.remaining() < nBytes)
                            throw Error("Illegal number of bytes for "+this.toString(true)+": "+nBytes+" required but got only "+buffer.remaining());
                        value = buffer.clone(); // Offset already set
                        value.limit = value.offset+nBytes;
                        buffer.offset += nBytes;
                        return value;
                    }

                    // Length-delimited embedded message
                    case ProtoBuf.TYPES["message"]: {
                        nBytes = buffer.readVarint32();
                        return this.resolvedType.decode(buffer, nBytes);
                    }

                    // Legacy group
                    case ProtoBuf.TYPES["group"]:
                        return this.resolvedType.decode(buffer, -1, this.id);
                }

                // We should never end here
                throw Error("[INTERNAL] Illegal wire type for "+this.toString(true)+": "+wireType);
            }

            /**
             * @alias ProtoBuf.Reflect.Message.Field
             * @expose
             */
            Reflect.Message.Field = Field;

            /**
             * Constructs a new Message ExtensionField.
             * @exports ProtoBuf.Reflect.Message.ExtensionField
             * @param {ProtoBuf.Reflect.Message} message Message reference
             * @param {string} rule Rule, one of requried, optional, repeated
             * @param {string} type Data type, e.g. int32
             * @param {string} name Field name
             * @param {number} id Unique field id
             * @param {Object.<string.*>=} options Options
             * @constructor
             * @extends ProtoBuf.Reflect.Message.Field
             */
            var ExtensionField = function(message, rule, type, name, id, options) {
                Field.call(this, message, rule, type, name, id, options);
            };

            // Extends Field
            ExtensionField.prototype = Object.create(Field.prototype);

            /**
             * @alias ProtoBuf.Reflect.Message.ExtensionField
             * @expose
             */
            Reflect.Message.ExtensionField = ExtensionField;

            /**
             * Constructs a new Enum.
             * @exports ProtoBuf.Reflect.Enum
             * @param {!ProtoBuf.Reflect.T} parent Parent Reflect object
             * @param {string} name Enum name
             * @param {Object.<string.*>=} options Enum options
             * @constructor
             * @extends ProtoBuf.Reflect.Namespace
             */
            var Enum = function(parent, name, options) {
                Namespace.call(this, parent, name, options);

                /**
                 * @override
                 */
                this.className = "Enum";

                /**
                 * Runtime enum object.
                 * @type {Object.<string,number>|null}
                 * @expose
                 */
                this.object = null;
            };

            // Extends Namespace
            Enum.prototype = Object.create(Namespace.prototype);

            /**
             * Builds this enum and returns the runtime counterpart.
             * @return {Object<string,*>}
             * @expose
             */
            Enum.prototype.build = function() {
                var enm = {};
                var values = this.getChildren(Enum.Value);
                for (var i=0; i<values.length; i++)
                    enm[values[i]['name']] = values[i]['id'];
                if (Object.defineProperty)
                    Object.defineProperty(enm, '$options', { "value": this.buildOpt() });
                return this.object = enm;
            };

            /**
             * @alias ProtoBuf.Reflect.Enum
             * @expose
             */
            Reflect.Enum = Enum;

            /**
             * Constructs a new Enum Value.
             * @exports ProtoBuf.Reflect.Enum.Value
             * @param {!ProtoBuf.Reflect.Enum} enm Enum reference
             * @param {string} name Field name
             * @param {number} id Unique field id
             * @constructor
             * @extends ProtoBuf.Reflect.T
             */
            var Value = function(enm, name, id) {
                T.call(this, enm, name);

                /**
                 * @override
                 */
                this.className = "Enum.Value";

                /**
                 * Unique enum value id.
                 * @type {number}
                 * @expose
                 */
                this.id = id;
            };

            // Extends T
            Value.prototype = Object.create(T.prototype);

            /**
             * @alias ProtoBuf.Reflect.Enum.Value
             * @expose
             */
            Reflect.Enum.Value = Value;

            /**
             * Constructs a new Service.
             * @exports ProtoBuf.Reflect.Service
             * @param {!ProtoBuf.Reflect.Namespace} root Root
             * @param {string} name Service name
             * @param {Object.<string,*>=} options Options
             * @constructor
             * @extends ProtoBuf.Reflect.Namespace
             */
            var Service = function(root, name, options) {
                Namespace.call(this, root, name, options);

                /**
                 * @override
                 */
                this.className = "Service";

                /**
                 * Built runtime service class.
                 * @type {?function(new:ProtoBuf.Builder.Service)}
                 */
                this.clazz = null;
            };

            // Extends Namespace
            Service.prototype = Object.create(Namespace.prototype);

            /**
             * Builds the service and returns the runtime counterpart, which is a fully functional class.
             * @see ProtoBuf.Builder.Service
             * @param {boolean=} rebuild Whether to rebuild or not
             * @return {Function} Service class
             * @throws {Error} If the message cannot be built
             * @expose
             */
            Service.prototype.build = function(rebuild) {
                if (this.clazz && !rebuild) return this.clazz;
                return this.clazz = (function(ProtoBuf, T) {

                    /**
                     * Constructs a new runtime Service.
                     * @name ProtoBuf.Builder.Service
                     * @param {function(string, ProtoBuf.Builder.Message, function(Error, ProtoBuf.Builder.Message=))=} rpcImpl RPC implementation receiving the method name and the message
                     * @class Barebone of all runtime services.
                     * @constructor
                     * @throws {Error} If the service cannot be created
                     */
                    var Service = function(rpcImpl) {
                        ProtoBuf.Builder.Service.call(this);

                        /**
                         * Service implementation.
                         * @name ProtoBuf.Builder.Service#rpcImpl
                         * @type {!function(string, ProtoBuf.Builder.Message, function(Error, ProtoBuf.Builder.Message=))}
                         * @expose
                         */
                        this.rpcImpl = rpcImpl || function(name, msg, callback) {
                            // This is what a user has to implement: A function receiving the method name, the actual message to
                            // send (type checked) and the callback that's either provided with the error as its first
                            // argument or null and the actual response message.
                            setTimeout(callback.bind(this, Error("Not implemented, see: https://github.com/dcodeIO/ProtoBuf.js/wiki/Services")), 0); // Must be async!
                        };
                    };

                    // Extends ProtoBuf.Builder.Service
                    Service.prototype = Object.create(ProtoBuf.Builder.Service.prototype);

                    if (Object.defineProperty)
                        Object.defineProperty(Service, "$options", { "value": T.buildOpt() }),
                        Object.defineProperty(Service.prototype, "$options", { "value": Service["$options"] });

                    /**
                     * Asynchronously performs an RPC call using the given RPC implementation.
                     * @name ProtoBuf.Builder.Service.[Method]
                     * @function
                     * @param {!function(string, ProtoBuf.Builder.Message, function(Error, ProtoBuf.Builder.Message=))} rpcImpl RPC implementation
                     * @param {ProtoBuf.Builder.Message} req Request
                     * @param {function(Error, (ProtoBuf.Builder.Message|ByteBuffer|Buffer|string)=)} callback Callback receiving
                     *  the error if any and the response either as a pre-parsed message or as its raw bytes
                     * @abstract
                     */

                    /**
                     * Asynchronously performs an RPC call using the instance's RPC implementation.
                     * @name ProtoBuf.Builder.Service#[Method]
                     * @function
                     * @param {ProtoBuf.Builder.Message} req Request
                     * @param {function(Error, (ProtoBuf.Builder.Message|ByteBuffer|Buffer|string)=)} callback Callback receiving
                     *  the error if any and the response either as a pre-parsed message or as its raw bytes
                     * @abstract
                     */

                    var rpc = T.getChildren(ProtoBuf.Reflect.Service.RPCMethod);
                    for (var i=0; i<rpc.length; i++) {
                        (function(method) {

                            // service#Method(message, callback)
                            Service.prototype[method.name] = function(req, callback) {
                                try {
                                    if (!req || !(req instanceof method.resolvedRequestType.clazz)) {
                                        setTimeout(callback.bind(this, Error("Illegal request type provided to service method "+T.name+"#"+method.name)), 0);
                                        return;
                                    }
                                    this.rpcImpl(method.fqn(), req, function(err, res) { // Assumes that this is properly async
                                        if (err) {
                                            callback(err);
                                            return;
                                        }
                                        try { res = method.resolvedResponseType.clazz.decode(res); } catch (notABuffer) {}
                                        if (!res || !(res instanceof method.resolvedResponseType.clazz)) {
                                            callback(Error("Illegal response type received in service method "+ T.name+"#"+method.name));
                                            return;
                                        }
                                        callback(null, res);
                                    });
                                } catch (err) {
                                    setTimeout(callback.bind(this, err), 0);
                                }
                            };

                            // Service.Method(rpcImpl, message, callback)
                            Service[method.name] = function(rpcImpl, req, callback) {
                                new Service(rpcImpl)[method.name](req, callback);
                            };

                            if (Object.defineProperty)
                                Object.defineProperty(Service[method.name], "$options", { "value": method.buildOpt() }),
                                Object.defineProperty(Service.prototype[method.name], "$options", { "value": Service[method.name]["$options"] });
                        })(rpc[i]);
                    }

                    return Service;

                })(ProtoBuf, this);
            };

            /**
             * @alias ProtoBuf.Reflect.Service
             * @expose
             */
            Reflect.Service = Service;

            /**
             * Abstract service method.
             * @exports ProtoBuf.Reflect.Service.Method
             * @param {!ProtoBuf.Reflect.Service} svc Service
             * @param {string} name Method name
             * @param {Object.<string,*>=} options Options
             * @constructor
             * @extends ProtoBuf.Reflect.T
             */
            var Method = function(svc, name, options) {
                T.call(this, svc, name);

                /**
                 * @override
                 */
                this.className = "Service.Method";

                /**
                 * Options.
                 * @type {Object.<string, *>}
                 * @expose
                 */
                this.options = options || {};
            };

            // Extends T
            Method.prototype = Object.create(T.prototype);

            /**
             * Builds the method's '$options' property.
             * @name ProtoBuf.Reflect.Service.Method#buildOpt
             * @function
             * @return {Object.<string,*>}
             */
            Method.prototype.buildOpt = Namespace.prototype.buildOpt;

            /**
             * @alias ProtoBuf.Reflect.Service.Method
             * @expose
             */
            Reflect.Service.Method = Method;

            /**
             * RPC service method.
             * @exports ProtoBuf.Reflect.Service.RPCMethod
             * @param {!ProtoBuf.Reflect.Service} svc Service
             * @param {string} name Method name
             * @param {string} request Request message name
             * @param {string} response Response message name
             * @param {Object.<string,*>=} options Options
             * @constructor
             * @extends ProtoBuf.Reflect.Service.Method
             */
            var RPCMethod = function(svc, name, request, response, options) {
                Method.call(this, svc, name, options);

                /**
                 * @override
                 */
                this.className = "Service.RPCMethod";

                /**
                 * Request message name.
                 * @type {string}
                 * @expose
                 */
                this.requestName = request;

                /**
                 * Response message name.
                 * @type {string}
                 * @expose
                 */
                this.responseName = response;

                /**
                 * Resolved request message type.
                 * @type {ProtoBuf.Reflect.Message}
                 * @expose
                 */
                this.resolvedRequestType = null;

                /**
                 * Resolved response message type.
                 * @type {ProtoBuf.Reflect.Message}
                 * @expose
                 */
                this.resolvedResponseType = null;
            };

            // Extends Method
            RPCMethod.prototype = Object.create(Method.prototype);

            /**
             * @alias ProtoBuf.Reflect.Service.RPCMethod
             * @expose
             */
            Reflect.Service.RPCMethod = RPCMethod;

            return Reflect;
        })(ProtoBuf);

        /**
         * @alias ProtoBuf.Builder
         * @expose
         */
        ProtoBuf.Builder = (function(ProtoBuf, Lang, Reflect) {
            "use strict";

            /**
             * Constructs a new Builder.
             * @exports ProtoBuf.Builder
             * @class Provides the functionality to build protocol messages.
             * @constructor
             */
            var Builder = function() {

                /**
                 * Namespace.
                 * @type {ProtoBuf.Reflect.Namespace}
                 * @expose
                 */
                this.ns = new Reflect.Namespace(null, ""); // Global namespace

                /**
                 * Namespace pointer.
                 * @type {ProtoBuf.Reflect.T}
                 * @expose
                 */
                this.ptr = this.ns;

                /**
                 * Resolved flag.
                 * @type {boolean}
                 * @expose
                 */
                this.resolved = false;

                /**
                 * The current building result.
                 * @type {Object.<string,ProtoBuf.Builder.Message|Object>|null}
                 * @expose
                 */
                this.result = null;

                /**
                 * Imported files.
                 * @type {Array.<string>}
                 * @expose
                 */
                this.files = {};

                /**
                 * Import root override.
                 * @type {?string}
                 * @expose
                 */
                this.importRoot = null;
            };

            /**
             * Resets the pointer to the root namespace.
             * @expose
             */
            Builder.prototype.reset = function() {
                this.ptr = this.ns;
            };

            /**
             * Defines a package on top of the current pointer position and places the pointer on it.
             * @param {string} pkg
             * @param {Object.<string,*>=} options
             * @return {ProtoBuf.Builder} this
             * @throws {Error} If the package name is invalid
             * @expose
             */
            Builder.prototype.define = function(pkg, options) {
                if (typeof pkg !== 'string' || !Lang.TYPEREF.test(pkg))
                    throw Error("Illegal package: "+pkg);
                var part = pkg.split("."), i;
                for (i=0; i<part.length; i++) // To be absolutely sure
                    if (!Lang.NAME.test(part[i]))
                        throw Error("Illegal package: "+part[i]);
                for (i=0; i<part.length; i++) {
                    if (!this.ptr.hasChild(part[i])) // Keep existing namespace
                        this.ptr.addChild(new Reflect.Namespace(this.ptr, part[i], options));
                    this.ptr = this.ptr.getChild(part[i]);
                }
                return this;
            };

            /**
             * Tests if a definition is a valid message definition.
             * @param {Object.<string,*>} def Definition
             * @return {boolean} true if valid, else false
             * @expose
             */
            Builder.isValidMessage = function(def) {
                // Messages require a string name
                if (typeof def["name"] !== 'string' || !Lang.NAME.test(def["name"]))
                    return false;
                // Messages must not contain values (that'd be an enum) or methods (that'd be a service)
                if (typeof def["values"] !== 'undefined' || typeof def["rpc"] !== 'undefined')
                    return false;
                // Fields, enums and messages are arrays if provided
                var i;
                if (typeof def["fields"] !== 'undefined') {
                    if (!ProtoBuf.Util.isArray(def["fields"]))
                        return false;
                    var ids = [], id; // IDs must be unique
                    for (i=0; i<def["fields"].length; i++) {
                        if (!Builder.isValidMessageField(def["fields"][i]))
                            return false;
                        id = parseInt(def["fields"][i]["id"], 10);
                        if (ids.indexOf(id) >= 0)
                            return false;
                        ids.push(id);
                    }
                    ids = null;
                }
                if (typeof def["enums"] !== 'undefined') {
                    if (!ProtoBuf.Util.isArray(def["enums"]))
                        return false;
                    for (i=0; i<def["enums"].length; i++)
                        if (!Builder.isValidEnum(def["enums"][i]))
                            return false;
                }
                if (typeof def["messages"] !== 'undefined') {
                    if (!ProtoBuf.Util.isArray(def["messages"]))
                        return false;
                    for (i=0; i<def["messages"].length; i++)
                        if (!Builder.isValidMessage(def["messages"][i]) && !Builder.isValidExtend(def["messages"][i]))
                            return false;
                }
                if (typeof def["extensions"] !== 'undefined')
                    if (!ProtoBuf.Util.isArray(def["extensions"]) || def["extensions"].length !== 2 || typeof def["extensions"][0] !== 'number' || typeof def["extensions"][1] !== 'number')
                        return false;
                return true;
            };

            /**
             * Tests if a definition is a valid message field definition.
             * @param {Object} def Definition
             * @return {boolean} true if valid, else false
             * @expose
             */
            Builder.isValidMessageField = function(def) {
                // Message fields require a string rule, name and type and an id
                if (typeof def["rule"] !== 'string' || typeof def["name"] !== 'string' || typeof def["type"] !== 'string' || typeof def["id"] === 'undefined')
                    return false;
                if (!Lang.RULE.test(def["rule"]) || !Lang.NAME.test(def["name"]) || !Lang.TYPEREF.test(def["type"]) || !Lang.ID.test(""+def["id"]))
                    return false;
                if (typeof def["options"] !== 'undefined') {
                    // Options are objects
                    if (typeof def["options"] !== 'object')
                        return false;
                    // Options are <string,string|number|boolean>
                    var keys = Object.keys(def["options"]);
                    for (var i=0, key; i<keys.length; i++)
                        if (typeof (key = keys[i]) !== 'string' || (typeof def["options"][key] !== 'string' && typeof def["options"][key] !== 'number' && typeof def["options"][key] !== 'boolean'))
                            return false;
                }
                return true;
            };

            /**
             * Tests if a definition is a valid enum definition.
             * @param {Object} def Definition
             * @return {boolean} true if valid, else false
             * @expose
             */
            Builder.isValidEnum = function(def) {
                // Enums require a string name
                if (typeof def["name"] !== 'string' || !Lang.NAME.test(def["name"]))
                    return false;
                // Enums require at least one value
                if (typeof def["values"] === 'undefined' || !ProtoBuf.Util.isArray(def["values"]) || def["values"].length == 0)
                    return false;
                for (var i=0; i<def["values"].length; i++) {
                    // Values are objects
                    if (typeof def["values"][i] != "object")
                        return false;
                    // Values require a string name and an id
                    if (typeof def["values"][i]["name"] !== 'string' || typeof def["values"][i]["id"] === 'undefined')
                        return false;
                    if (!Lang.NAME.test(def["values"][i]["name"]) || !Lang.NEGID.test(""+def["values"][i]["id"]))
                        return false;
                }
                // It's not important if there are other fields because ["values"] is already unique
                return true;
            };

            /**
             * Creates ths specified protocol types at the current pointer position.
             * @param {Array.<Object.<string,*>>} defs Messages, enums or services to create
             * @return {ProtoBuf.Builder} this
             * @throws {Error} If a message definition is invalid
             * @expose
             */
            Builder.prototype.create = function(defs) {
                if (!defs)
                    return this; // Nothing to create
                if (!ProtoBuf.Util.isArray(defs))
                    defs = [defs];
                if (defs.length == 0)
                    return this;

                // It's quite hard to keep track of scopes and memory here, so let's do this iteratively.
                var stack = [], def, obj, subObj, i, j;
                stack.push(defs); // One level [a, b, c]
                while (stack.length > 0) {
                    defs = stack.pop();
                    if (ProtoBuf.Util.isArray(defs)) { // Stack always contains entire namespaces
                        while (defs.length > 0) {
                            def = defs.shift(); // Namespace always contains an array of messages, enums and services
                            if (Builder.isValidMessage(def)) {
                                obj = new Reflect.Message(this.ptr, def["name"], def["options"], def["isGroup"]);
                                // Create fields
                                if (def["fields"] && def["fields"].length > 0) {
                                    for (i=0; i<def["fields"].length; i++) { // i=Fields
                                        if (obj.hasChild(def['fields'][i]['id']))
                                            throw Error("Duplicate field id in message "+obj.name+": "+def['fields'][i]['id']);
                                        if (def["fields"][i]["options"]) {
                                            subObj = Object.keys(def["fields"][i]["options"]);
                                            for (j=0; j<subObj.length; j++) { // j=Option names
                                                if (typeof subObj[j] !== 'string')
                                                    throw Error("Illegal field option name in message "+obj.name+"#"+def["fields"][i]["name"]+": "+subObj[j]);
                                                if (typeof def["fields"][i]["options"][subObj[j]] !== 'string' && typeof def["fields"][i]["options"][subObj[j]] !== 'number' && typeof def["fields"][i]["options"][subObj[j]] !== 'boolean')
                                                    throw Error("Illegal field option value in message "+obj.name+"#"+def["fields"][i]["name"]+"#"+subObj[j]+": "+def["fields"][i]["options"][subObj[j]]);
                                            }
                                            subObj = null;
                                        }
                                        obj.addChild(new Reflect.Message.Field(obj, def["fields"][i]["rule"], def["fields"][i]["type"], def["fields"][i]["name"], def["fields"][i]["id"], def["fields"][i]["options"]));
                                    }
                                }
                                // Push enums and messages to stack
                                subObj = [];
                                if (typeof def["enums"] !== 'undefined' && def['enums'].length > 0)
                                    for (i=0; i<def["enums"].length; i++)
                                        subObj.push(def["enums"][i]);
                                if (def["messages"] && def["messages"].length > 0)
                                    for (i=0; i<def["messages"].length; i++)
                                        subObj.push(def["messages"][i]);
                                // Set extension range
                                if (def["extensions"]) {
                                    obj.extensions = def["extensions"];
                                    if (obj.extensions[0] < ProtoBuf.ID_MIN)
                                        obj.extensions[0] = ProtoBuf.ID_MIN;
                                    if (obj.extensions[1] > ProtoBuf.ID_MAX)
                                        obj.extensions[1] = ProtoBuf.ID_MAX;
                                }
                                this.ptr.addChild(obj); // Add to current namespace
                                if (subObj.length > 0) {
                                    stack.push(defs); // Push the current level back
                                    defs = subObj; // Continue processing sub level
                                    subObj = null;
                                    this.ptr = obj; // And move the pointer to this namespace
                                    obj = null;
                                    continue;
                                }
                                subObj = null;
                                obj = null;
                            } else if (Builder.isValidEnum(def)) {
                                obj = new Reflect.Enum(this.ptr, def["name"], def["options"]);
                                for (i=0; i<def["values"].length; i++)
                                    obj.addChild(new Reflect.Enum.Value(obj, def["values"][i]["name"], def["values"][i]["id"]));
                                this.ptr.addChild(obj);
                                obj = null;
                            } else if (Builder.isValidService(def)) {
                                obj = new Reflect.Service(this.ptr, def["name"], def["options"]);
                                for (i in def["rpc"])
                                    if (def["rpc"].hasOwnProperty(i))
                                        obj.addChild(new Reflect.Service.RPCMethod(obj, i, def["rpc"][i]["request"], def["rpc"][i]["response"], def["rpc"][i]["options"]));
                                this.ptr.addChild(obj);
                                obj = null;
                            } else if (Builder.isValidExtend(def)) {
                                obj = this.ptr.resolve(def["ref"]);
                                if (obj) {
                                    for (i=0; i<def["fields"].length; i++) { // i=Fields
                                        if (obj.hasChild(def['fields'][i]['id']))
                                            throw Error("Duplicate extended field id in message "+obj.name+": "+def['fields'][i]['id']);
                                        if (def['fields'][i]['id'] < obj.extensions[0] || def['fields'][i]['id'] > obj.extensions[1])
                                            throw Error("Illegal extended field id in message "+obj.name+": "+def['fields'][i]['id']+" ("+obj.extensions.join(' to ')+" expected)");
                                        // TODO: See #161
                                        /* subObj = new (this.ptr instanceof Reflect.Message ? Reflect.Message.ExtensionField : Reflect.Message.Field)(obj, def["fields"][i]["rule"], def["fields"][i]["type"], def["fields"][i]["name"], def["fields"][i]["id"], def["fields"][i]["options"]);
                                        if (this.ptr instanceof Reflect.Message)
                                            this.ptr.addChild(subObj);
                                        else
                                            obj.addChild(subObj); */
                                        obj.addChild(new Reflect.Message.Field(obj, def["fields"][i]["rule"], def["fields"][i]["type"], def["fields"][i]["name"], def["fields"][i]["id"], def["fields"][i]["options"]));
                                    }
                                } else if (!/\.?google\.protobuf\./.test(def["ref"])) // Silently skip internal extensions
                                    throw Error("Extended message "+def["ref"]+" is not defined");
                            } else
                                throw Error("Not a valid definition: "+JSON.stringify(def));
                            def = null;
                        }
                        // Break goes here
                    } else
                        throw Error("Not a valid namespace: "+JSON.stringify(defs));
                    defs = null;
                    this.ptr = this.ptr.parent; // This namespace is s done
                }
                this.resolved = false; // Require re-resolve
                this.result = null; // Require re-build
                return this;
            };

            /**
             * Imports another definition into this builder.
             * @param {Object.<string,*>} json Parsed import
             * @param {(string|{root: string, file: string})=} filename Imported file name
             * @return {ProtoBuf.Builder} this
             * @throws {Error} If the definition or file cannot be imported
             * @expose
             */
            Builder.prototype["import"] = function(json, filename) {
                if (typeof filename === 'string') {
                    if (ProtoBuf.Util.IS_NODE)
                        filename = require("path")['resolve'](filename);
                    if (this.files[filename] === true) {
                        this.reset();
                        return this; // Skip duplicate imports
                    }
                    this.files[filename] = true;
                }
                if (!!json['imports'] && json['imports'].length > 0) {
                    var importRoot, delim = '/', resetRoot = false;
                    if (typeof filename === 'object') { // If an import root is specified, override
                        this.importRoot = filename["root"]; resetRoot = true; // ... and reset afterwards
                        importRoot = this.importRoot;
                        filename = filename["file"];
                        if (importRoot.indexOf("\\") >= 0 || filename.indexOf("\\") >= 0) delim = '\\';
                    } else if (typeof filename === 'string') {
                        if (this.importRoot) // If import root is overridden, use it
                            importRoot = this.importRoot;
                        else { // Otherwise compute from filename
                            if (filename.indexOf("/") >= 0) { // Unix
                                importRoot = filename.replace(/\/[^\/]*$/, "");
                                if (/* /file.proto */ importRoot === "")
                                    importRoot = "/";
                            } else if (filename.indexOf("\\") >= 0) { // Windows
                                importRoot = filename.replace(/\\[^\\]*$/, "");
                                delim = '\\';
                            } else
                                importRoot = ".";
                        }
                    } else
                        importRoot = null;

                    for (var i=0; i<json['imports'].length; i++) {
                        if (typeof json['imports'][i] === 'string') { // Import file
                            if (!importRoot)
                                throw Error("Cannot determine import root: File name is unknown");
                            var importFilename = json['imports'][i];
                            if (/^google\/protobuf\//.test(importFilename))
                                continue; // Not needed and therefore not used
                            importFilename = importRoot+delim+importFilename;
                            if (this.files[importFilename] === true)
                                continue; // Already imported
                            if (/\.proto$/i.test(importFilename) && !ProtoBuf.DotProto)     // If this is a NOPARSE build
                                importFilename = importFilename.replace(/\.proto$/, ".json"); // always load the JSON file
                            var contents = ProtoBuf.Util.fetch(importFilename);
                            if (contents === null)
                                throw Error("Failed to import '"+importFilename+"' in '"+filename+"': File not found");
                            if (/\.json$/i.test(importFilename)) // Always possible
                                this["import"](JSON.parse(contents+""), importFilename); // May throw
                            else
                                this["import"]((new ProtoBuf.DotProto.Parser(contents+"")).parse(), importFilename); // May throw
                        } else // Import structure
                            if (!filename)
                                this["import"](json['imports'][i]);
                            else if (/\.(\w+)$/.test(filename)) // With extension: Append _importN to the name portion to make it unique
                                this["import"](json['imports'][i], filename.replace(/^(.+)\.(\w+)$/, function($0, $1, $2) { return $1+"_import"+i+"."+$2; }));
                            else // Without extension: Append _importN to make it unique
                                this["import"](json['imports'][i], filename+"_import"+i);
                    }
                    if (resetRoot) // Reset import root override when all imports are done
                        this.importRoot = null;
                }
                if (json['messages']) {
                    if (json['package'])
                        this.define(json['package'], json["options"]);
                    this.create(json['messages']);
                    this.reset();
                }
                if (json['enums']) {
                    if (json['package'])
                        this.define(json['package'], json["options"]);
                    this.create(json['enums']);
                    this.reset();
                }
                if (json['services']) {
                    if (json['package'])
                        this.define(json['package'], json["options"]);
                    this.create(json['services']);
                    this.reset();
                }
                if (json['extends']) {
                    if (json['package'])
                        this.define(json['package'], json["options"]);
                    this.create(json['extends']);
                    this.reset();
                }
                return this;
            };

            /**
             * Tests if a definition is a valid service definition.
             * @param {Object} def Definition
             * @return {boolean} true if valid, else false
             * @expose
             */
            Builder.isValidService = function(def) {
                // Services require a string name and an rpc object
                return !(typeof def["name"] !== 'string' || !Lang.NAME.test(def["name"]) || typeof def["rpc"] !== 'object');
            };

            /**
             * Tests if a definition is a valid extension.
             * @param {Object} def Definition
             * @returns {boolean} true if valid, else false
             * @expose
            */
            Builder.isValidExtend = function(def) {
                if (typeof def["ref"] !== 'string' || !Lang.TYPEREF.test(def["ref"]))
                    return false;
                var i;
                if (typeof def["fields"] !== 'undefined') {
                    if (!ProtoBuf.Util.isArray(def["fields"]))
                        return false;
                    var ids = [], id; // IDs must be unique (does not yet test for the extended message's ids)
                    for (i=0; i<def["fields"].length; i++) {
                        if (!Builder.isValidMessageField(def["fields"][i]))
                            return false;
                        id = parseInt(def["id"], 10);
                        if (ids.indexOf(id) >= 0)
                            return false;
                        ids.push(id);
                    }
                    ids = null;
                }
                return true;
            };

            /**
             * Resolves all namespace objects.
             * @throws {Error} If a type cannot be resolved
             * @expose
             */
            Builder.prototype.resolveAll = function() {
                // Resolve all reflected objects
                var res;
                if (this.ptr == null || typeof this.ptr.type === 'object')
                    return; // Done (already resolved)
                if (this.ptr instanceof Reflect.Namespace) {
                    // Build all children
                    var children = this.ptr.getChildren();
                    for (var i=0; i<children.length; i++)
                        this.ptr = children[i], this.resolveAll();
                } else if (this.ptr instanceof Reflect.Message.Field) {
                    if (!Lang.TYPE.test(this.ptr.type)) { // Resolve type...
                        if (!Lang.TYPEREF.test(this.ptr.type))
                            throw Error("Illegal type reference in "+this.ptr.toString(true)+": "+this.ptr.type);
                        res = this.ptr.parent.resolve(this.ptr.type, true);
                        if (!res)
                            throw Error("Unresolvable type reference in "+this.ptr.toString(true)+": "+this.ptr.type);
                        this.ptr.resolvedType = res;
                        if (res instanceof Reflect.Enum)
                            this.ptr.type = ProtoBuf.TYPES["enum"];
                        else if (res instanceof Reflect.Message)
                            this.ptr.type = res.isGroup ? ProtoBuf.TYPES["group"] : ProtoBuf.TYPES["message"];
                        else
                            throw Error("Illegal type reference in "+this.ptr.toString(true)+": "+this.ptr.type);
                    } else
                        this.ptr.type = ProtoBuf.TYPES[this.ptr.type];
                } else if (this.ptr instanceof ProtoBuf.Reflect.Enum.Value) {
                    // No need to build enum values (built in enum)
                } else if (this.ptr instanceof ProtoBuf.Reflect.Service.Method) {
                    if (this.ptr instanceof ProtoBuf.Reflect.Service.RPCMethod) {
                        res = this.ptr.parent.resolve(this.ptr.requestName);
                        if (!res || !(res instanceof ProtoBuf.Reflect.Message))
                            throw Error("Illegal type reference in "+this.ptr.toString(true)+": "+this.ptr.requestName);
                        this.ptr.resolvedRequestType = res;
                        res = this.ptr.parent.resolve(this.ptr.responseName);
                        if (!res || !(res instanceof ProtoBuf.Reflect.Message))
                            throw Error("Illegal type reference in "+this.ptr.toString(true)+": "+this.ptr.responseName);
                        this.ptr.resolvedResponseType = res;
                    } else {
                        // Should not happen as nothing else is implemented
                        throw Error("Illegal service type in "+this.ptr.toString(true));
                    }
                } else
                    throw Error("Illegal object in namespace: "+typeof(this.ptr)+":"+this.ptr);
                this.reset();
            };

            /**
             * Builds the protocol. This will first try to resolve all definitions and, if this has been successful,
             * return the built package.
             * @param {string=} path Specifies what to return. If omitted, the entire namespace will be returned.
             * @return {ProtoBuf.Builder.Message|Object.<string,*>}
             * @throws {Error} If a type could not be resolved
             * @expose
             */
            Builder.prototype.build = function(path) {
                this.reset();
                if (!this.resolved)
                    this.resolveAll(),
                    this.resolved = true,
                    this.result = null; // Require re-build
                if (this.result == null) // (Re-)Build
                    this.result = this.ns.build();
                if (!path)
                    return this.result;
                else {
                    var part = path.split(".");
                    var ptr = this.result; // Build namespace pointer (no hasChild etc.)
                    for (var i=0; i<part.length; i++)
                        if (ptr[part[i]])
                            ptr = ptr[part[i]];
                        else {
                            ptr = null;
                            break;
                        }
                    return ptr;
                }
            };

            /**
             * Similar to {@link ProtoBuf.Builder#build}, but looks up the internal reflection descriptor.
             * @param {string=} path Specifies what to return. If omitted, the entire namespace wiil be returned.
             * @return {ProtoBuf.Reflect.T} Reflection descriptor or `null` if not found
             */
            Builder.prototype.lookup = function(path) {
                return path ? this.ns.resolve(path) : this.ns;
            };

            /**
             * Returns a string representation of this object.
             * @return {string} String representation as of "Builder"
             * @expose
             */
            Builder.prototype.toString = function() {
                return "Builder";
            };

            // Pseudo types documented in Reflect.js.
            // Exist for the sole purpose of being able to "... instanceof ProtoBuf.Builder.Message" etc.
            Builder.Message = function() {};
            Builder.Service = function() {};

            return Builder;

        })(ProtoBuf, ProtoBuf.Lang, ProtoBuf.Reflect);


        /**
         * Loads a .proto string and returns the Builder.
         * @param {string} proto .proto file contents
         * @param {(ProtoBuf.Builder|string|{root: string, file: string})=} builder Builder to append to. Will create a new one if omitted.
         * @param {(string|{root: string, file: string})=} filename The corresponding file name if known. Must be specified for imports.
         * @return {ProtoBuf.Builder} Builder to create new messages
         * @throws {Error} If the definition cannot be parsed or built
         * @expose
         */
        ProtoBuf.loadProto = function(proto, builder, filename) {
            if (typeof builder === 'string' || (builder && typeof builder["file"] === 'string' && typeof builder["root"] === 'string')) {
                filename = builder;
                builder = null;
            }
            return ProtoBuf.loadJson((new ProtoBuf.DotProto.Parser(proto)).parse(), builder, filename);
        };

        /**
         * Loads a .proto string and returns the Builder. This is an alias of {@link ProtoBuf.loadProto}.
         * @function
         * @param {string} proto .proto file contents
         * @param {(ProtoBuf.Builder|string)=} builder Builder to append to. Will create a new one if omitted.
         * @param {(string|{root: string, file: string})=} filename The corresponding file name if known. Must be specified for imports.
         * @return {ProtoBuf.Builder} Builder to create new messages
         * @throws {Error} If the definition cannot be parsed or built
         * @expose
         */
        ProtoBuf.protoFromString = ProtoBuf.loadProto; // Legacy

        /**
         * Loads a .proto file and returns the Builder.
         * @param {string|{root: string, file: string}} filename Path to proto file or an object specifying 'file' with
         *  an overridden 'root' path for all imported files.
         * @param {function(?Error, !ProtoBuf.Builder=)=} callback Callback that will receive `null` as the first and
         *  the Builder as its second argument on success, otherwise the error as its first argument. If omitted, the
         *  file will be read synchronously and this function will return the Builder.
         * @param {ProtoBuf.Builder=} builder Builder to append to. Will create a new one if omitted.
         * @return {?ProtoBuf.Builder|undefined} The Builder if synchronous (no callback specified, will be NULL if the
         *   request has failed), else undefined
         * @expose
         */
        ProtoBuf.loadProtoFile = function(filename, callback, builder) {
            if (callback && typeof callback === 'object')
                builder = callback,
                callback = null;
            else if (!callback || typeof callback !== 'function')
                callback = null;
            if (callback)
                return ProtoBuf.Util.fetch(typeof filename === 'string' ? filename : filename["root"]+"/"+filename["file"], function(contents) {
                    if (contents === null) {
                        callback(Error("Failed to fetch file"));
                        return;
                    }
                    try {
                        callback(null, ProtoBuf.loadProto(contents, builder, filename));
                    } catch (e) {
                        callback(e);
                    }
                });
            var contents = ProtoBuf.Util.fetch(typeof filename === 'object' ? filename["root"]+"/"+filename["file"] : filename);
            return contents === null ? null : ProtoBuf.loadProto(contents, builder, filename);
        };

        /**
         * Loads a .proto file and returns the Builder. This is an alias of {@link ProtoBuf.loadProtoFile}.
         * @function
         * @param {string|{root: string, file: string}} filename Path to proto file or an object specifying 'file' with
         *  an overridden 'root' path for all imported files.
         * @param {function(?Error, !ProtoBuf.Builder=)=} callback Callback that will receive `null` as the first and
         *  the Builder as its second argument on success, otherwise the error as its first argument. If omitted, the
         *  file will be read synchronously and this function will return the Builder.
         * @param {ProtoBuf.Builder=} builder Builder to append to. Will create a new one if omitted.
         * @return {!ProtoBuf.Builder|undefined} The Builder if synchronous (no callback specified, will be NULL if the
         *   request has failed), else undefined
         * @expose
         */
        ProtoBuf.protoFromFile = ProtoBuf.loadProtoFile; // Legacy


        /**
         * Constructs a new Builder with the specified package defined.
         * @param {string=} pkg Package name as fully qualified name, e.g. "My.Game". If no package is specified, the
         * builder will only contain a global namespace.
         * @param {Object.<string,*>=} options Top level options
         * @return {ProtoBuf.Builder} New Builder
         * @expose
         */
        ProtoBuf.newBuilder = function(pkg, options) {
            var builder = new ProtoBuf.Builder();
            if (typeof pkg !== 'undefined' && pkg !== null)
                builder.define(pkg, options);
            return builder;
        };

        /**
         * Loads a .json definition and returns the Builder.
         * @param {!*|string} json JSON definition
         * @param {(ProtoBuf.Builder|string|{root: string, file: string})=} builder Builder to append to. Will create a new one if omitted.
         * @param {(string|{root: string, file: string})=} filename The corresponding file name if known. Must be specified for imports.
         * @return {ProtoBuf.Builder} Builder to create new messages
         * @throws {Error} If the definition cannot be parsed or built
         * @expose
         */
        ProtoBuf.loadJson = function(json, builder, filename) {
            if (typeof builder === 'string' || (builder && typeof builder["file"] === 'string' && typeof builder["root"] === 'string'))
                filename = builder,
                builder = null;
            if (!builder || typeof builder !== 'object')
                builder = ProtoBuf.newBuilder();
            if (typeof json === 'string')
                json = JSON.parse(json);
            builder["import"](json, filename);
            builder.resolveAll();
            builder.build();
            return builder;
        };

        /**
         * Loads a .json file and returns the Builder.
         * @param {string|!{root: string, file: string}} filename Path to json file or an object specifying 'file' with
         *  an overridden 'root' path for all imported files.
         * @param {function(?Error, !ProtoBuf.Builder=)=} callback Callback that will receive `null` as the first and
         *  the Builder as its second argument on success, otherwise the error as its first argument. If omitted, the
         *  file will be read synchronously and this function will return the Builder.
         * @param {ProtoBuf.Builder=} builder Builder to append to. Will create a new one if omitted.
         * @return {?ProtoBuf.Builder|undefined} The Builder if synchronous (no callback specified, will be NULL if the
         *   request has failed), else undefined
         * @expose
         */
        ProtoBuf.loadJsonFile = function(filename, callback, builder) {
            if (callback && typeof callback === 'object')
                builder = callback,
                callback = null;
            else if (!callback || typeof callback !== 'function')
                callback = null;
            if (callback)
                return ProtoBuf.Util.fetch(typeof filename === 'string' ? filename : filename["root"]+"/"+filename["file"], function(contents) {
                    if (contents === null) {
                        callback(Error("Failed to fetch file"));
                        return;
                    }
                    try {
                        callback(null, ProtoBuf.loadJson(JSON.parse(contents), builder, filename));
                    } catch (e) {
                        callback(e);
                    }
                });
            var contents = ProtoBuf.Util.fetch(typeof filename === 'object' ? filename["root"]+"/"+filename["file"] : filename);
            return contents === null ? null : ProtoBuf.loadJson(JSON.parse(contents), builder, filename);
        };

        return ProtoBuf;
    }

    /* CommonJS */ if (typeof module !== 'undefined' && module["exports"])
        module["exports"] = init(require("bytebuffer"));
    /* AMD */ else if (typeof define === 'function' && define["amd"])
        define(["ByteBuffer"], init);
    /* Global */ else
        (global["dcodeIO"] = global["dcodeIO"] || {})["ProtoBuf"] = init(global["dcodeIO"]["ByteBuffer"]);

})(this);

},{"bytebuffer":86,"fs":2,"path":13}],86:[function(require,module,exports){
/*
 ByteBuffer.js (c) 2013-2014 Daniel Wirtz <dcode@dcode.io>
 This version of ByteBuffer.js uses an ArrayBuffer (AB) as its backing buffer and is compatible with modern browsers.
 Released under the Apache License, Version 2.0
 see: https://github.com/dcodeIO/ByteBuffer.js for details
*/
(function(r){function s(l){function d(a,b,c){"undefined"===typeof a&&(a=d.DEFAULT_CAPACITY);"undefined"===typeof b&&(b=d.DEFAULT_ENDIAN);"undefined"===typeof c&&(c=d.DEFAULT_NOASSERT);if(!c){a|=0;if(0>a)throw new RangeError("Illegal capacity: 0 <= "+a);if("boolean"!==typeof b)throw new TypeError("Illegal littleEndian: Not a boolean");if("boolean"!==typeof c)throw new TypeError("Illegal noAssert: Not a boolean");}this.buffer=0===a?r:new ArrayBuffer(a);this.view=0===a?null:new DataView(this.buffer);
this.offset=0;this.markedOffset=-1;this.limit=a;this.littleEndian="undefined"!==typeof b?!!b:!1;this.noAssert=!!c}d.VERSION="3.1.0";d.LITTLE_ENDIAN=!0;d.BIG_ENDIAN=!1;d.DEFAULT_CAPACITY=16;d.DEFAULT_ENDIAN=d.BIG_ENDIAN;d.DEFAULT_NOASSERT=!1;d.Long=l||null;var r=new ArrayBuffer(0);d.allocate=function(a,b,c){return new d(a,b,c)};d.concat=function(a,b,c,e){if("boolean"===typeof b||"string"!==typeof b)e=c,c=b,b=void 0;for(var h=0,f=0,g=a.length,n;f<g;++f)d.isByteBuffer(a[f])||(a[f]=d.wrap(a[f],b)),n=
a[f].limit-a[f].offset,0<n&&(h+=n);if(0===h)return new d(0,c,e);b=new d(h,c,e);e=new Uint8Array(b.buffer);for(f=0;f<g;)c=a[f++],n=c.limit-c.offset,0>=n||(e.set((new Uint8Array(c.buffer)).subarray(c.offset,c.limit),b.offset),b.offset+=n);b.limit=b.offset;b.offset=0;return b};d.isByteBuffer=function(a){return a&&a instanceof d};d.type=function(){return ArrayBuffer};d.wrap=function(a,b,c,e){"string"!==typeof b&&(e=c,c=b,b=void 0);if("string"===typeof a)switch("undefined"===typeof b&&(b="utf8"),b){case "base64":return d.fromBase64(a,
c);case "hex":return d.fromHex(a,c);case "binary":return d.fromBinary(a,c);case "utf8":return d.fromUTF8(a,c);case "debug":return d.fromDebug(a,c);default:throw new TypeError("Unsupported encoding: "+b);}if(null===a||"object"!==typeof a)throw new TypeError("Illegal buffer: null or non-object");if(d.isByteBuffer(a))return b=d.prototype.clone.call(a),b.markedOffset=-1,b;if(a instanceof Uint8Array)b=new d(0,c,e),0<a.length&&(b.buffer=a.buffer,b.offset=a.byteOffset,b.limit=a.byteOffset+a.length,b.view=
0<a.length?new DataView(a.buffer):null);else if(a instanceof ArrayBuffer)b=new d(0,c,e),0<a.byteLength&&(b.buffer=a,b.offset=0,b.limit=a.byteLength,b.view=0<a.byteLength?new DataView(a):null);else if("[object Array]"===Object.prototype.toString.call(a))for(b=new d(a.length,c,e),b.limit=a.length,i=0;i<a.length;++i)b.view.setUint8(i,a[i]);else throw new TypeError("Illegal buffer");return b};d.prototype.writeInt8=function(a,b){var c="undefined"===typeof b;c&&(b=this.offset);if(!this.noAssert){if("number"!==
typeof a||0!==a%1)throw new TypeError("Illegal value: "+a+" (not an integer)");a|=0;if("number"!==typeof b||0!==b%1)throw new TypeError("Illegal offset: "+b+" (not an integer)");b>>>=0;if(0>b||b+0>this.buffer.byteLength)throw new RangeError("Illegal offset: 0 <= "+b+" (+0) <= "+this.buffer.byteLength);}b+=1;var e=this.buffer.byteLength;b>e&&this.resize((e*=2)>b?e:b);this.view.setInt8(b-1,a);c&&(this.offset+=1);return this};d.prototype.writeByte=d.prototype.writeInt8;d.prototype.readInt8=function(a){var b=
"undefined"===typeof a;b&&(a=this.offset);if(!this.noAssert){if("number"!==typeof a||0!==a%1)throw new TypeError("Illegal offset: "+a+" (not an integer)");a>>>=0;if(0>a||a+1>this.buffer.byteLength)throw new RangeError("Illegal offset: 0 <= "+a+" (+1) <= "+this.buffer.byteLength);}a=this.view.getInt8(a);b&&(this.offset+=1);return a};d.prototype.readByte=d.prototype.readInt8;d.prototype.writeUint8=function(a,b){var c="undefined"===typeof b;c&&(b=this.offset);if(!this.noAssert){if("number"!==typeof a||
0!==a%1)throw new TypeError("Illegal value: "+a+" (not an integer)");a>>>=0;if("number"!==typeof b||0!==b%1)throw new TypeError("Illegal offset: "+b+" (not an integer)");b>>>=0;if(0>b||b+0>this.buffer.byteLength)throw new RangeError("Illegal offset: 0 <= "+b+" (+0) <= "+this.buffer.byteLength);}b+=1;var e=this.buffer.byteLength;b>e&&this.resize((e*=2)>b?e:b);this.view.setUint8(b-1,a);c&&(this.offset+=1);return this};d.prototype.readUint8=function(a){var b="undefined"===typeof a;b&&(a=this.offset);
if(!this.noAssert){if("number"!==typeof a||0!==a%1)throw new TypeError("Illegal offset: "+a+" (not an integer)");a>>>=0;if(0>a||a+1>this.buffer.byteLength)throw new RangeError("Illegal offset: 0 <= "+a+" (+1) <= "+this.buffer.byteLength);}a=this.view.getUint8(a);b&&(this.offset+=1);return a};d.prototype.writeInt16=function(a,b){var c="undefined"===typeof b;c&&(b=this.offset);if(!this.noAssert){if("number"!==typeof a||0!==a%1)throw new TypeError("Illegal value: "+a+" (not an integer)");a|=0;if("number"!==
typeof b||0!==b%1)throw new TypeError("Illegal offset: "+b+" (not an integer)");b>>>=0;if(0>b||b+0>this.buffer.byteLength)throw new RangeError("Illegal offset: 0 <= "+b+" (+0) <= "+this.buffer.byteLength);}b+=2;var e=this.buffer.byteLength;b>e&&this.resize((e*=2)>b?e:b);this.view.setInt16(b-2,a,this.littleEndian);c&&(this.offset+=2);return this};d.prototype.writeShort=d.prototype.writeInt16;d.prototype.readInt16=function(a){var b="undefined"===typeof a;b&&(a=this.offset);if(!this.noAssert){if("number"!==
typeof a||0!==a%1)throw new TypeError("Illegal offset: "+a+" (not an integer)");a>>>=0;if(0>a||a+2>this.buffer.byteLength)throw new RangeError("Illegal offset: 0 <= "+a+" (+2) <= "+this.buffer.byteLength);}a=this.view.getInt16(a,this.littleEndian);b&&(this.offset+=2);return a};d.prototype.readShort=d.prototype.readInt16;d.prototype.writeUint16=function(a,b){var c="undefined"===typeof b;c&&(b=this.offset);if(!this.noAssert){if("number"!==typeof a||0!==a%1)throw new TypeError("Illegal value: "+a+" (not an integer)");
a>>>=0;if("number"!==typeof b||0!==b%1)throw new TypeError("Illegal offset: "+b+" (not an integer)");b>>>=0;if(0>b||b+0>this.buffer.byteLength)throw new RangeError("Illegal offset: 0 <= "+b+" (+0) <= "+this.buffer.byteLength);}b+=2;var e=this.buffer.byteLength;b>e&&this.resize((e*=2)>b?e:b);this.view.setUint16(b-2,a,this.littleEndian);c&&(this.offset+=2);return this};d.prototype.readUint16=function(a){var b="undefined"===typeof a;b&&(a=this.offset);if(!this.noAssert){if("number"!==typeof a||0!==a%
1)throw new TypeError("Illegal offset: "+a+" (not an integer)");a>>>=0;if(0>a||a+2>this.buffer.byteLength)throw new RangeError("Illegal offset: 0 <= "+a+" (+2) <= "+this.buffer.byteLength);}a=this.view.getUint16(a,this.littleEndian);b&&(this.offset+=2);return a};d.prototype.writeInt32=function(a,b){var c="undefined"===typeof b;c&&(b=this.offset);if(!this.noAssert){if("number"!==typeof a||0!==a%1)throw new TypeError("Illegal value: "+a+" (not an integer)");a|=0;if("number"!==typeof b||0!==b%1)throw new TypeError("Illegal offset: "+
b+" (not an integer)");b>>>=0;if(0>b||b+0>this.buffer.byteLength)throw new RangeError("Illegal offset: 0 <= "+b+" (+0) <= "+this.buffer.byteLength);}b+=4;var e=this.buffer.byteLength;b>e&&this.resize((e*=2)>b?e:b);this.view.setInt32(b-4,a,this.littleEndian);c&&(this.offset+=4);return this};d.prototype.writeInt=d.prototype.writeInt32;d.prototype.readInt32=function(a){var b="undefined"===typeof a;b&&(a=this.offset);if(!this.noAssert){if("number"!==typeof a||0!==a%1)throw new TypeError("Illegal offset: "+
a+" (not an integer)");a>>>=0;if(0>a||a+4>this.buffer.byteLength)throw new RangeError("Illegal offset: 0 <= "+a+" (+4) <= "+this.buffer.byteLength);}a=this.view.getInt32(a,this.littleEndian);b&&(this.offset+=4);return a};d.prototype.readInt=d.prototype.readInt32;d.prototype.writeUint32=function(a,b){var c="undefined"===typeof b;c&&(b=this.offset);if(!this.noAssert){if("number"!==typeof a||0!==a%1)throw new TypeError("Illegal value: "+a+" (not an integer)");a>>>=0;if("number"!==typeof b||0!==b%1)throw new TypeError("Illegal offset: "+
b+" (not an integer)");b>>>=0;if(0>b||b+0>this.buffer.byteLength)throw new RangeError("Illegal offset: 0 <= "+b+" (+0) <= "+this.buffer.byteLength);}b+=4;var e=this.buffer.byteLength;b>e&&this.resize((e*=2)>b?e:b);this.view.setUint32(b-4,a,this.littleEndian);c&&(this.offset+=4);return this};d.prototype.readUint32=function(a){var b="undefined"===typeof a;b&&(a=this.offset);if(!this.noAssert){if("number"!==typeof a||0!==a%1)throw new TypeError("Illegal offset: "+a+" (not an integer)");a>>>=0;if(0>a||
a+4>this.buffer.byteLength)throw new RangeError("Illegal offset: 0 <= "+a+" (+4) <= "+this.buffer.byteLength);}a=this.view.getUint32(a,this.littleEndian);b&&(this.offset+=4);return a};l&&(d.prototype.writeInt64=function(a,b){var c="undefined"===typeof b;c&&(b=this.offset);if(!this.noAssert){if("number"===typeof a)a=l.fromNumber(a);else if(!(a&&a instanceof l))throw new TypeError("Illegal value: "+a+" (not an integer or Long)");if("number"!==typeof b||0!==b%1)throw new TypeError("Illegal offset: "+
b+" (not an integer)");b>>>=0;if(0>b||b+0>this.buffer.byteLength)throw new RangeError("Illegal offset: 0 <= "+b+" (+0) <= "+this.buffer.byteLength);}"number"===typeof a&&(a=l.fromNumber(a));b+=8;var e=this.buffer.byteLength;b>e&&this.resize((e*=2)>b?e:b);b-=8;this.littleEndian?(this.view.setInt32(b,a.low,!0),this.view.setInt32(b+4,a.high,!0)):(this.view.setInt32(b,a.high,!1),this.view.setInt32(b+4,a.low,!1));c&&(this.offset+=8);return this},d.prototype.writeLong=d.prototype.writeInt64,d.prototype.readInt64=
function(a){var b="undefined"===typeof a;b&&(a=this.offset);if(!this.noAssert){if("number"!==typeof a||0!==a%1)throw new TypeError("Illegal offset: "+a+" (not an integer)");a>>>=0;if(0>a||a+8>this.buffer.byteLength)throw new RangeError("Illegal offset: 0 <= "+a+" (+8) <= "+this.buffer.byteLength);}a=this.littleEndian?new l(this.view.getInt32(a,!0),this.view.getInt32(a+4,!0),!1):new l(this.view.getInt32(a+4,!1),this.view.getInt32(a,!1),!1);b&&(this.offset+=8);return a},d.prototype.readLong=d.prototype.readInt64,
d.prototype.writeUint64=function(a,b){var c="undefined"===typeof b;c&&(b=this.offset);if(!this.noAssert){if("number"===typeof a)a=l.fromNumber(a);else if(!(a&&a instanceof l))throw new TypeError("Illegal value: "+a+" (not an integer or Long)");if("number"!==typeof b||0!==b%1)throw new TypeError("Illegal offset: "+b+" (not an integer)");b>>>=0;if(0>b||b+0>this.buffer.byteLength)throw new RangeError("Illegal offset: 0 <= "+b+" (+0) <= "+this.buffer.byteLength);}"number"===typeof a&&(a=l.fromNumber(a));
b+=8;var e=this.buffer.byteLength;b>e&&this.resize((e*=2)>b?e:b);b-=8;this.littleEndian?(this.view.setInt32(b,a.low,!0),this.view.setInt32(b+4,a.high,!0)):(this.view.setInt32(b,a.high,!1),this.view.setInt32(b+4,a.low,!1));c&&(this.offset+=8);return this},d.prototype.readUint64=function(a){var b="undefined"===typeof a;b&&(a=this.offset);if(!this.noAssert){if("number"!==typeof a||0!==a%1)throw new TypeError("Illegal offset: "+a+" (not an integer)");a>>>=0;if(0>a||a+8>this.buffer.byteLength)throw new RangeError("Illegal offset: 0 <= "+
a+" (+8) <= "+this.buffer.byteLength);}a=this.littleEndian?new l(this.view.getInt32(a,!0),this.view.getInt32(a+4,!0),!0):new l(this.view.getInt32(a+4,!1),this.view.getInt32(a,!1),!0);b&&(this.offset+=8);return a});d.prototype.writeFloat32=function(a,b){var c="undefined"===typeof b;c&&(b=this.offset);if(!this.noAssert){if("number"!==typeof a)throw new TypeError("Illegal value: "+a+" (not a number)");if("number"!==typeof b||0!==b%1)throw new TypeError("Illegal offset: "+b+" (not an integer)");b>>>=
0;if(0>b||b+0>this.buffer.byteLength)throw new RangeError("Illegal offset: 0 <= "+b+" (+0) <= "+this.buffer.byteLength);}b+=4;var e=this.buffer.byteLength;b>e&&this.resize((e*=2)>b?e:b);this.view.setFloat32(b-4,a,this.littleEndian);c&&(this.offset+=4);return this};d.prototype.writeFloat=d.prototype.writeFloat32;d.prototype.readFloat32=function(a){var b="undefined"===typeof a;b&&(a=this.offset);if(!this.noAssert){if("number"!==typeof a||0!==a%1)throw new TypeError("Illegal offset: "+a+" (not an integer)");
a>>>=0;if(0>a||a+4>this.buffer.byteLength)throw new RangeError("Illegal offset: 0 <= "+a+" (+4) <= "+this.buffer.byteLength);}a=this.view.getFloat32(a,this.littleEndian);b&&(this.offset+=4);return a};d.prototype.readFloat=d.prototype.readFloat32;d.prototype.writeFloat64=function(a,b){var c="undefined"===typeof b;c&&(b=this.offset);if(!this.noAssert){if("number"!==typeof a)throw new TypeError("Illegal value: "+a+" (not a number)");if("number"!==typeof b||0!==b%1)throw new TypeError("Illegal offset: "+
b+" (not an integer)");b>>>=0;if(0>b||b+0>this.buffer.byteLength)throw new RangeError("Illegal offset: 0 <= "+b+" (+0) <= "+this.buffer.byteLength);}b+=8;var e=this.buffer.byteLength;b>e&&this.resize((e*=2)>b?e:b);this.view.setFloat64(b-8,a,this.littleEndian);c&&(this.offset+=8);return this};d.prototype.writeDouble=d.prototype.writeFloat64;d.prototype.readFloat64=function(a){var b="undefined"===typeof a;b&&(a=this.offset);if(!this.noAssert){if("number"!==typeof a||0!==a%1)throw new TypeError("Illegal offset: "+
a+" (not an integer)");a>>>=0;if(0>a||a+8>this.buffer.byteLength)throw new RangeError("Illegal offset: 0 <= "+a+" (+8) <= "+this.buffer.byteLength);}a=this.view.getFloat64(a,this.littleEndian);b&&(this.offset+=8);return a};d.prototype.readDouble=d.prototype.readFloat64;d.MAX_VARINT32_BYTES=5;d.calculateVarint32=function(a){a>>>=0;return 128>a?1:16384>a?2:2097152>a?3:268435456>a?4:5};d.zigZagEncode32=function(a){return((a|=0)<<1^a>>31)>>>0};d.zigZagDecode32=function(a){return a>>>1^-(a&1)|0};d.prototype.writeVarint32=
function(a,b){var c="undefined"===typeof b;c&&(b=this.offset);if(!this.noAssert){if("number"!==typeof a||0!==a%1)throw new TypeError("Illegal value: "+a+" (not an integer)");a|=0;if("number"!==typeof b||0!==b%1)throw new TypeError("Illegal offset: "+b+" (not an integer)");b>>>=0;if(0>b||b+0>this.buffer.byteLength)throw new RangeError("Illegal offset: 0 <= "+b+" (+0) <= "+this.buffer.byteLength);}var e=d.calculateVarint32(a);b+=e;var h=this.buffer.byteLength;b>h&&this.resize((h*=2)>b?h:b);b-=e;this.view.setUint8(b,
e=a|128);a>>>=0;128<=a?(e=a>>7|128,this.view.setUint8(b+1,e),16384<=a?(e=a>>14|128,this.view.setUint8(b+2,e),2097152<=a?(e=a>>21|128,this.view.setUint8(b+3,e),268435456<=a?(this.view.setUint8(b+4,a>>28&15),e=5):(this.view.setUint8(b+3,e&127),e=4)):(this.view.setUint8(b+2,e&127),e=3)):(this.view.setUint8(b+1,e&127),e=2)):(this.view.setUint8(b,e&127),e=1);return c?(this.offset+=e,this):e};d.prototype.writeVarint32ZigZag=function(a,b){return this.writeVarint32(d.zigZagEncode32(a),b)};d.prototype.readVarint32=
function(a){var b="undefined"===typeof a;b&&(a=this.offset);if(!this.noAssert){if("number"!==typeof a||0!==a%1)throw new TypeError("Illegal offset: "+a+" (not an integer)");a>>>=0;if(0>a||a+1>this.buffer.byteLength)throw new RangeError("Illegal offset: 0 <= "+a+" (+1) <= "+this.buffer.byteLength);}var c=0,e=0,d;do d=this.view.getUint8(a+c),5>c&&(e|=(d&127)<<7*c>>>0),++c;while(128===(d&128));e|=0;return b?(this.offset+=c,e):{value:e,length:c}};d.prototype.readVarint32ZigZag=function(a){a=this.readVarint32(a);
"object"===typeof a?a.value=d.zigZagDecode32(a.value):a=d.zigZagDecode32(a);return a};l&&(d.MAX_VARINT64_BYTES=10,d.calculateVarint64=function(a){"number"===typeof a&&(a=l.fromNumber(a));var b=a.toInt()>>>0,c=a.shiftRightUnsigned(28).toInt()>>>0;a=a.shiftRightUnsigned(56).toInt()>>>0;return 0==a?0==c?16384>b?128>b?1:2:2097152>b?3:4:16384>c?128>c?5:6:2097152>c?7:8:128>a?9:10},d.zigZagEncode64=function(a){"number"===typeof a?a=l.fromNumber(a,!1):!1!==a.unsigned&&(a=a.toSigned());return a.shiftLeft(1).xor(a.shiftRight(63)).toUnsigned()},
d.zigZagDecode64=function(a){"number"===typeof a?a=l.fromNumber(a,!1):!1!==a.unsigned&&(a=a.toSigned());return a.shiftRightUnsigned(1).xor(a.and(l.ONE).toSigned().negate()).toSigned()},d.prototype.writeVarint64=function(a,b){var c="undefined"===typeof b;c&&(b=this.offset);if(!this.noAssert){if("number"===typeof a)a=l.fromNumber(a);else if(!(a&&a instanceof l))throw new TypeError("Illegal value: "+a+" (not an integer or Long)");if("number"!==typeof b||0!==b%1)throw new TypeError("Illegal offset: "+
b+" (not an integer)");b>>>=0;if(0>b||b+0>this.buffer.byteLength)throw new RangeError("Illegal offset: 0 <= "+b+" (+0) <= "+this.buffer.byteLength);}"number"===typeof a?a=l.fromNumber(a,!1):!1!==a.unsigned&&(a=a.toSigned());var e=d.calculateVarint64(a),h=a.toInt()>>>0,f=a.shiftRightUnsigned(28).toInt()>>>0,g=a.shiftRightUnsigned(56).toInt()>>>0;b+=e;var n=this.buffer.byteLength;b>n&&this.resize((n*=2)>b?n:b);b-=e;switch(e){case 10:this.view.setUint8(b+9,g>>>7&1);case 9:this.view.setUint8(b+8,9!==
e?g|128:g&127);case 8:this.view.setUint8(b+7,8!==e?f>>>21|128:f>>>21&127);case 7:this.view.setUint8(b+6,7!==e?f>>>14|128:f>>>14&127);case 6:this.view.setUint8(b+5,6!==e?f>>>7|128:f>>>7&127);case 5:this.view.setUint8(b+4,5!==e?f|128:f&127);case 4:this.view.setUint8(b+3,4!==e?h>>>21|128:h>>>21&127);case 3:this.view.setUint8(b+2,3!==e?h>>>14|128:h>>>14&127);case 2:this.view.setUint8(b+1,2!==e?h>>>7|128:h>>>7&127);case 1:this.view.setUint8(b,1!==e?h|128:h&127)}return c?(this.offset+=e,this):e},d.prototype.writeVarint64ZigZag=
function(a,b){return this.writeVarint64(d.zigZagEncode64(a),b)},d.prototype.readVarint64=function(a){var b="undefined"===typeof a;b&&(a=this.offset);if(!this.noAssert){if("number"!==typeof a||0!==a%1)throw new TypeError("Illegal offset: "+a+" (not an integer)");a>>>=0;if(0>a||a+1>this.buffer.byteLength)throw new RangeError("Illegal offset: 0 <= "+a+" (+1) <= "+this.buffer.byteLength);}var c=a,e=0,d=0,f=0,g=0,g=this.view.getUint8(a++),e=g&127;if(g&128&&(g=this.view.getUint8(a++),e|=(g&127)<<7,g&128&&
(g=this.view.getUint8(a++),e|=(g&127)<<14,g&128&&(g=this.view.getUint8(a++),e|=(g&127)<<21,g&128&&(g=this.view.getUint8(a++),d=g&127,g&128&&(g=this.view.getUint8(a++),d|=(g&127)<<7,g&128&&(g=this.view.getUint8(a++),d|=(g&127)<<14,g&128&&(g=this.view.getUint8(a++),d|=(g&127)<<21,g&128&&(g=this.view.getUint8(a++),f=g&127,g&128&&(g=this.view.getUint8(a++),f|=(g&127)<<7,g&128))))))))))throw Error("Data must be corrupt: Buffer overrun");e=l.from28Bits(e,d,f,!1);return b?(this.offset=a,e):{value:e,length:a-
c}},d.prototype.readVarint64ZigZag=function(a){(a=this.readVarint64(a))&&a.value instanceof l?a.value=d.zigZagDecode64(a.value):a=d.zigZagDecode64(a);return a});d.prototype.writeCString=function(a,b){var c="undefined"===typeof b;c&&(b=this.offset);var e,d=a.length;if(!this.noAssert){if("string"!==typeof a)throw new TypeError("Illegal str: Not a string");for(e=0;e<d;++e)if(0===a.charCodeAt(e))throw new RangeError("Illegal str: Contains NULL-characters");if("number"!==typeof b||0!==b%1)throw new TypeError("Illegal offset: "+
b+" (not an integer)");b>>>=0;if(0>b||b+0>this.buffer.byteLength)throw new RangeError("Illegal offset: 0 <= "+b+" (+0) <= "+this.buffer.byteLength);}e=b;d=k.b(k.a(a))[1];b+=d+1;var f=this.buffer.byteLength;b>f&&this.resize((f*=2)>b?f:b);b-=d+1;k.e(k.a(a),function(a){this.view.setUint8(b++,a)}.bind(this));this.view.setUint8(b++,0);return c?(this.offset=b-e,this):d};d.prototype.readCString=function(a){var b="undefined"===typeof a;b&&(a=this.offset);if(!this.noAssert){if("number"!==typeof a||0!==a%1)throw new TypeError("Illegal offset: "+
a+" (not an integer)");a>>>=0;if(0>a||a+1>this.buffer.byteLength)throw new RangeError("Illegal offset: 0 <= "+a+" (+1) <= "+this.buffer.byteLength);}var c=a,e,d=-1;k.d(function(){if(0===d)return null;if(a>=this.limit)throw RangeError("Illegal range: Truncated data, "+a+" < "+this.limit);return 0===(d=this.view.getUint8(a++))?null:d}.bind(this),e=k.c(),!0);return b?(this.offset=a,e()):{string:e(),length:a-c}};d.prototype.writeIString=function(a,b){var c="undefined"===typeof b;c&&(b=this.offset);if(!this.noAssert){if("string"!==
typeof a)throw new TypeError("Illegal str: Not a string");if("number"!==typeof b||0!==b%1)throw new TypeError("Illegal offset: "+b+" (not an integer)");b>>>=0;if(0>b||b+0>this.buffer.byteLength)throw new RangeError("Illegal offset: 0 <= "+b+" (+0) <= "+this.buffer.byteLength);}var e=b,d;d=k.b(k.a(a),this.noAssert)[1];b+=4+d;var f=this.buffer.byteLength;b>f&&this.resize((f*=2)>b?f:b);b-=4+d;this.view.setUint32(b,d,this.littleEndian);b+=4;k.e(k.a(a),function(a){this.view.setUint8(b++,a)}.bind(this));
if(b!==e+4+d)throw new RangeError("Illegal range: Truncated data, "+b+" == "+(b+4+d));return c?(this.offset=b,this):b-e};d.prototype.readIString=function(a){var b="undefined"===typeof a;b&&(a=this.offset);if(!this.noAssert){if("number"!==typeof a||0!==a%1)throw new TypeError("Illegal offset: "+a+" (not an integer)");a>>>=0;if(0>a||a+4>this.buffer.byteLength)throw new RangeError("Illegal offset: 0 <= "+a+" (+4) <= "+this.buffer.byteLength);}var c=0,e=a,c=this.view.getUint32(a,this.littleEndian);a+=
4;var d=a+c;k.d(function(){return a<d?this.view.getUint8(a++):null}.bind(this),c=k.c(),this.noAssert);c=c();return b?(this.offset=a,c):{string:c,length:a-e}};d.METRICS_CHARS="c";d.METRICS_BYTES="b";d.prototype.writeUTF8String=function(a,b){var c="undefined"===typeof b;c&&(b=this.offset);if(!this.noAssert){if("number"!==typeof b||0!==b%1)throw new TypeError("Illegal offset: "+b+" (not an integer)");b>>>=0;if(0>b||b+0>this.buffer.byteLength)throw new RangeError("Illegal offset: 0 <= "+b+" (+0) <= "+
this.buffer.byteLength);}var e,d=b;e=k.b(k.a(a))[1];b+=e;var f=this.buffer.byteLength;b>f&&this.resize((f*=2)>b?f:b);b-=e;k.e(k.a(a),function(a){this.view.setUint8(b++,a)}.bind(this));return c?(this.offset=b,this):b-d};d.prototype.writeString=d.prototype.writeUTF8String;d.calculateUTF8Chars=function(a){return k.b(k.a(a))[0]};d.calculateUTF8Bytes=function(a){return k.b(k.a(a))[1]};d.prototype.readUTF8String=function(a,b,c){"number"===typeof b&&(c=b,b=void 0);var e="undefined"===typeof c;e&&(c=this.offset);
"undefined"===typeof b&&(b=d.METRICS_CHARS);if(!this.noAssert){if("number"!==typeof a||0!==a%1)throw new TypeError("Illegal length: "+a+" (not an integer)");a|=0;if("number"!==typeof c||0!==c%1)throw new TypeError("Illegal offset: "+c+" (not an integer)");c>>>=0;if(0>c||c+0>this.buffer.byteLength)throw new RangeError("Illegal offset: 0 <= "+c+" (+0) <= "+this.buffer.byteLength);}var h=0,f=c,g;if(b===d.METRICS_CHARS){g=k.c();k.i(function(){return h<a&&c<this.limit?this.view.getUint8(c++):null}.bind(this),
function(a){++h;k.g(a,g)}.bind(this));if(h!==a)throw new RangeError("Illegal range: Truncated data, "+h+" == "+a);return e?(this.offset=c,g()):{string:g(),length:c-f}}if(b===d.METRICS_BYTES){if(!this.noAssert){if("number"!==typeof c||0!==c%1)throw new TypeError("Illegal offset: "+c+" (not an integer)");c>>>=0;if(0>c||c+a>this.buffer.byteLength)throw new RangeError("Illegal offset: 0 <= "+c+" (+"+a+") <= "+this.buffer.byteLength);}var n=c+a;k.d(function(){return c<n?this.view.getUint8(c++):null}.bind(this),
g=k.c(),this.noAssert);if(c!==n)throw new RangeError("Illegal range: Truncated data, "+c+" == "+n);return e?(this.offset=c,g()):{string:g(),length:c-f}}throw new TypeError("Unsupported metrics: "+b);};d.prototype.readString=d.prototype.readUTF8String;d.prototype.writeVString=function(a,b){var c="undefined"===typeof b;c&&(b=this.offset);if(!this.noAssert){if("string"!==typeof a)throw new TypeError("Illegal str: Not a string");if("number"!==typeof b||0!==b%1)throw new TypeError("Illegal offset: "+b+
" (not an integer)");b>>>=0;if(0>b||b+0>this.buffer.byteLength)throw new RangeError("Illegal offset: 0 <= "+b+" (+0) <= "+this.buffer.byteLength);}var e=b,h,f;h=k.b(k.a(a),this.noAssert)[1];f=d.calculateVarint32(h);b+=f+h;var g=this.buffer.byteLength;b>g&&this.resize((g*=2)>b?g:b);b-=f+h;b+=this.writeVarint32(h,b);k.e(k.a(a),function(a){this.view.setUint8(b++,a)}.bind(this));if(b!==e+h+f)throw new RangeError("Illegal range: Truncated data, "+b+" == "+(b+h+f));return c?(this.offset=b,this):b-e};d.prototype.readVString=
function(a){var b="undefined"===typeof a;b&&(a=this.offset);if(!this.noAssert){if("number"!==typeof a||0!==a%1)throw new TypeError("Illegal offset: "+a+" (not an integer)");a>>>=0;if(0>a||a+1>this.buffer.byteLength)throw new RangeError("Illegal offset: 0 <= "+a+" (+1) <= "+this.buffer.byteLength);}var c=this.readVarint32(a),e=a;a+=c.length;var c=c.value,d=a+c,c=k.c();k.d(function(){return a<d?this.view.getUint8(a++):null}.bind(this),c,this.noAssert);c=c();return b?(this.offset=a,c):{string:c,length:a-
e}};d.prototype.append=function(a,b,c){if("number"===typeof b||"string"!==typeof b)c=b,b=void 0;var e="undefined"===typeof c;e&&(c=this.offset);if(!this.noAssert){if("number"!==typeof c||0!==c%1)throw new TypeError("Illegal offset: "+c+" (not an integer)");c>>>=0;if(0>c||c+0>this.buffer.byteLength)throw new RangeError("Illegal offset: 0 <= "+c+" (+0) <= "+this.buffer.byteLength);}a instanceof d||(a=d.wrap(a,b));b=a.limit-a.offset;if(0>=b)return this;c+=b;var h=this.buffer.byteLength;c>h&&this.resize((h*=
2)>c?h:c);(new Uint8Array(this.buffer,c-b)).set((new Uint8Array(a.buffer)).subarray(a.offset,a.limit));a.offset+=b;e&&(this.offset+=b);return this};d.prototype.appendTo=function(a,b){a.append(this,b);return this};d.prototype.assert=function(a){this.noAssert=!a;return this};d.prototype.capacity=function(){return this.buffer.byteLength};d.prototype.clear=function(){this.offset=0;this.limit=this.buffer.byteLength;this.markedOffset=-1;return this};d.prototype.clone=function(a){var b=new d(0,this.littleEndian,
this.noAssert);a?(a=new ArrayBuffer(this.buffer.byteLength),(new Uint8Array(a)).set(this.buffer),b.buffer=a,b.view=new DataView(a)):(b.buffer=this.buffer,b.view=this.view);b.offset=this.offset;b.markedOffset=this.markedOffset;b.limit=this.limit;return b};d.prototype.compact=function(a,b){"undefined"===typeof a&&(a=this.offset);"undefined"===typeof b&&(b=this.limit);if(!this.noAssert){if("number"!==typeof a||0!==a%1)throw new TypeError("Illegal begin: Not an integer");a>>>=0;if("number"!==typeof b||
0!==b%1)throw new TypeError("Illegal end: Not an integer");b>>>=0;if(0>a||a>b||b>this.buffer.byteLength)throw new RangeError("Illegal range: 0 <= "+a+" <= "+b+" <= "+this.buffer.byteLength);}if(0===a&&b===this.buffer.byteLength)return this;var c=b-a;if(0===c)return this.buffer=r,this.view=null,0<=this.markedOffset&&(this.markedOffset-=a),this.limit=this.offset=0,this;var e=new ArrayBuffer(c);(new Uint8Array(e)).set((new Uint8Array(this.buffer)).subarray(a,b));this.buffer=e;this.view=new DataView(e);
0<=this.markedOffset&&(this.markedOffset-=a);this.offset=0;this.limit=c;return this};d.prototype.copy=function(a,b){"undefined"===typeof a&&(a=this.offset);"undefined"===typeof b&&(b=this.limit);if(!this.noAssert){if("number"!==typeof a||0!==a%1)throw new TypeError("Illegal begin: Not an integer");a>>>=0;if("number"!==typeof b||0!==b%1)throw new TypeError("Illegal end: Not an integer");b>>>=0;if(0>a||a>b||b>this.buffer.byteLength)throw new RangeError("Illegal range: 0 <= "+a+" <= "+b+" <= "+this.buffer.byteLength);
}if(a===b)return new d(0,this.littleEndian,this.noAssert);var c=b-a,e=new d(c,this.littleEndian,this.noAssert);e.offset=0;e.limit=c;0<=e.markedOffset&&(e.markedOffset-=a);this.copyTo(e,0,a,b);return e};d.prototype.copyTo=function(a,b,c,e){var h,f;if(!this.noAssert&&!d.isByteBuffer(a))throw new TypeError("Illegal target: Not a ByteBuffer");b=(f="undefined"===typeof b)?a.offset:b|0;c=(h="undefined"===typeof c)?this.offset:c|0;e="undefined"===typeof e?this.limit:e|0;if(0>b||b>a.buffer.byteLength)throw new RangeError("Illegal target range: 0 <= "+
b+" <= "+a.buffer.byteLength);if(0>c||e>this.buffer.byteLength)throw new RangeError("Illegal source range: 0 <= "+c+" <= "+this.buffer.byteLength);var g=e-c;if(0===g)return a;a.ensureCapacity(b+g);(new Uint8Array(a.buffer)).set((new Uint8Array(this.buffer)).subarray(c,e),b);h&&(this.offset+=g);f&&(a.offset+=g);return this};d.prototype.ensureCapacity=function(a){var b=this.buffer.byteLength;return b<a?this.resize((b*=2)>a?b:a):this};d.prototype.fill=function(a,b,c){var e="undefined"===typeof b;e&&
(b=this.offset);"string"===typeof a&&0<a.length&&(a=a.charCodeAt(0));"undefined"===typeof b&&(b=this.offset);"undefined"===typeof c&&(c=this.limit);if(!this.noAssert){if("number"!==typeof a||0!==a%1)throw new TypeError("Illegal value: "+a+" (not an integer)");a|=0;if("number"!==typeof b||0!==b%1)throw new TypeError("Illegal begin: Not an integer");b>>>=0;if("number"!==typeof c||0!==c%1)throw new TypeError("Illegal end: Not an integer");c>>>=0;if(0>b||b>c||c>this.buffer.byteLength)throw new RangeError("Illegal range: 0 <= "+
b+" <= "+c+" <= "+this.buffer.byteLength);}if(b>=c)return this;for(;b<c;)this.view.setUint8(b++,a);e&&(this.offset=b);return this};d.prototype.flip=function(){this.limit=this.offset;this.offset=0;return this};d.prototype.mark=function(a){a="undefined"===typeof a?this.offset:a;if(!this.noAssert){if("number"!==typeof a||0!==a%1)throw new TypeError("Illegal offset: "+a+" (not an integer)");a>>>=0;if(0>a||a+0>this.buffer.byteLength)throw new RangeError("Illegal offset: 0 <= "+a+" (+0) <= "+this.buffer.byteLength);
}this.markedOffset=a;return this};d.prototype.order=function(a){if(!this.noAssert&&"boolean"!==typeof a)throw new TypeError("Illegal littleEndian: Not a boolean");this.littleEndian=!!a;return this};d.prototype.LE=function(a){this.littleEndian="undefined"!==typeof a?!!a:!0;return this};d.prototype.BE=function(a){this.littleEndian="undefined"!==typeof a?!a:!1;return this};d.prototype.prepend=function(a,b,c){if("number"===typeof b||"string"!==typeof b)c=b,b=void 0;var e="undefined"===typeof c;e&&(c=
this.offset);if(!this.noAssert){if("number"!==typeof c||0!==c%1)throw new TypeError("Illegal offset: "+c+" (not an integer)");c>>>=0;if(0>c||c+0>this.buffer.byteLength)throw new RangeError("Illegal offset: 0 <= "+c+" (+0) <= "+this.buffer.byteLength);}a instanceof d||(a=d.wrap(a,b));b=a.limit-a.offset;if(0>=b)return this;var h=b-c,f;if(0<h){var g=new ArrayBuffer(this.buffer.byteLength+h);f=new Uint8Array(g);f.set((new Uint8Array(this.buffer)).subarray(c,this.buffer.byteLength),b);this.buffer=g;this.view=
new DataView(g);this.offset+=h;0<=this.markedOffset&&(this.markedOffset+=h);this.limit+=h;c+=h}else f=new Uint8Array(this.buffer);f.set((new Uint8Array(a.buffer)).subarray(a.offset,a.limit),c-b);a.offset=a.limit;e&&(this.offset-=b);return this};d.prototype.prependTo=function(a,b){a.prepend(this,b);return this};d.prototype.printDebug=function(a){"function"!==typeof a&&(a=console.log.bind(console));a(this.toString()+"\n-------------------------------------------------------------------\n"+this.toDebug(!0))};
d.prototype.remaining=function(){return this.limit-this.offset};d.prototype.reset=function(){0<=this.markedOffset?(this.offset=this.markedOffset,this.markedOffset=-1):this.offset=0;return this};d.prototype.resize=function(a){if(!this.noAssert){if("number"!==typeof a||0!==a%1)throw new TypeError("Illegal capacity: "+a+" (not an integer)");a|=0;if(0>a)throw new RangeError("Illegal capacity: 0 <= "+a);}this.buffer.byteLength<a&&(a=new ArrayBuffer(a),(new Uint8Array(a)).set(new Uint8Array(this.buffer)),
this.buffer=a,this.view=new DataView(a));return this};d.prototype.reverse=function(a,b){"undefined"===typeof a&&(a=this.offset);"undefined"===typeof b&&(b=this.limit);if(!this.noAssert){if("number"!==typeof a||0!==a%1)throw new TypeError("Illegal begin: Not an integer");a>>>=0;if("number"!==typeof b||0!==b%1)throw new TypeError("Illegal end: Not an integer");b>>>=0;if(0>a||a>b||b>this.buffer.byteLength)throw new RangeError("Illegal range: 0 <= "+a+" <= "+b+" <= "+this.buffer.byteLength);}if(a===b)return this;
Array.prototype.reverse.call((new Uint8Array(this.buffer)).subarray(a,b));this.view=new DataView(this.buffer);return this};d.prototype.skip=function(a){if(!this.noAssert){if("number"!==typeof a||0!==a%1)throw new TypeError("Illegal length: "+a+" (not an integer)");a|=0}var b=this.offset+a;if(!this.noAssert&&(0>b||b>this.buffer.byteLength))throw new RangeError("Illegal length: 0 <= "+this.offset+" + "+a+" <= "+this.buffer.byteLength);this.offset=b;return this};d.prototype.slice=function(a,b){"undefined"===
typeof a&&(a=this.offset);"undefined"===typeof b&&(b=this.limit);if(!this.noAssert){if("number"!==typeof a||0!==a%1)throw new TypeError("Illegal begin: Not an integer");a>>>=0;if("number"!==typeof b||0!==b%1)throw new TypeError("Illegal end: Not an integer");b>>>=0;if(0>a||a>b||b>this.buffer.byteLength)throw new RangeError("Illegal range: 0 <= "+a+" <= "+b+" <= "+this.buffer.byteLength);}var c=this.clone();c.offset=a;c.limit=b;return c};d.prototype.toBuffer=function(a){var b=this.offset,c=this.limit;
if(b>c)var e=b,b=c,c=e;if(!this.noAssert){if("number"!==typeof b||0!==b%1)throw new TypeError("Illegal offset: Not an integer");b>>>=0;if("number"!==typeof c||0!==c%1)throw new TypeError("Illegal limit: Not an integer");c>>>=0;if(0>b||b>c||c>this.buffer.byteLength)throw new RangeError("Illegal range: 0 <= "+b+" <= "+c+" <= "+this.buffer.byteLength);}if(!a&&0===b&&c===this.buffer.byteLength)return this.buffer;if(b===c)return r;a=new ArrayBuffer(c-b);(new Uint8Array(a)).set((new Uint8Array(this.buffer)).subarray(b,
c),0);return a};d.prototype.toArrayBuffer=d.prototype.toBuffer;d.prototype.toString=function(a){if("undefined"===typeof a)return"ByteBufferAB(offset="+this.offset+",markedOffset="+this.markedOffset+",limit="+this.limit+",capacity="+this.capacity()+")";switch(a){case "utf8":return this.toUTF8();case "base64":return this.toBase64();case "hex":return this.toHex();case "binary":return this.toBinary();case "debug":return this.toDebug();case "columns":return this.o();default:throw Error("Unsupported encoding: "+
a);}};var m="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=",m=m+"";d.prototype.toBase64=function(a,b){"undefined"===typeof a&&(a=this.offset);"undefined"===typeof b&&(b=this.limit);if(!this.noAssert){if("number"!==typeof a||0!==a%1)throw new TypeError("Illegal begin: Not an integer");a>>>=0;if("number"!==typeof b||0!==b%1)throw new TypeError("Illegal end: Not an integer");b>>>=0;if(0>a||a>b||b>this.buffer.byteLength)throw new RangeError("Illegal range: 0 <= "+a+" <= "+b+" <= "+
this.buffer.byteLength);}if(a===b)return"";for(var c,e,d,f,g,k,l="";a<b;)c=this.view.getUint8(a++),e=(f=a<b)?this.view.getUint8(a++):0,d=(g=a<b)?this.view.getUint8(a++):0,k=c>>2,c=(c&3)<<4|e>>4,e=(e&15)<<2|d>>6,d&=63,g||(d=64,f||(e=64)),l+=m.charAt(k)+m.charAt(c)+m.charAt(e)+m.charAt(d);return l};d.fromBase64=function(a,b,c){if(!c){if("string"!==typeof a)throw new TypeError("Illegal str: Not a string");if(0!==a.length%4)throw new TypeError("Illegal str: Length not a multiple of 4");}var e=a.length,
h=0,f;for(f=a.length-1;0<=f;--f)if("="===a.charAt(f))h++;else break;if(2<h)throw new TypeError("Illegal str: Suffix is too large");if(0===e)return new d(0,b,c);var g,k,l,p=new d(e/4*3-h,b,c);for(b=f=0;f<e;){h=m.indexOf(a.charAt(f++));g=f<e?m.indexOf(a.charAt(f++)):0;k=f<e?m.indexOf(a.charAt(f++)):0;l=f<e?m.indexOf(a.charAt(f++)):0;if(!c&&(0>h||0>g||0>k||0>l))throw new TypeError("Illegal str: Contains non-base64 characters");p.view.setUint8(b++,h<<2|g>>4);64!==k&&(p.view.setUint8(b++,g<<4&240|k>>2,
b),64!==l&&p.view.setUint8(b++,k<<6&192|l))}p.limit=b;return p};d.btoa=function(a){return d.fromBinary(a).toBase64()};d.atob=function(a){return d.fromBase64(a).toBinary()};d.prototype.toBinary=function(a,b){a="undefined"===typeof a?this.offset:a;b="undefined"===typeof b?this.limit:b;if(!this.noAssert){if("number"!==typeof a||0!==a%1)throw new TypeError("Illegal begin: Not an integer");a>>>=0;if("number"!==typeof b||0!==b%1)throw new TypeError("Illegal end: Not an integer");b>>>=0;if(0>a||a>b||b>this.buffer.byteLength)throw new RangeError("Illegal range: 0 <= "+
a+" <= "+b+" <= "+this.buffer.byteLength);}if(a===b)return"";for(var c=[];a<b;)c.push(this.view.getUint8(a++));return String.fromCharCode.apply(String,c)};d.fromBinary=function(a,b,c){if(!c&&"string"!==typeof a)throw new TypeError("Illegal str: Not a string");for(var e=0,h=a.length,f=new d(h,b,c);e<h;){b=a.charCodeAt(e);if(!c&&255<b)throw new TypeError("Illegal charCode at "+e+": 0 <= "+b+" <= 255");f.view.setUint8(e++,b)}f.limit=h;return f};d.prototype.toDebug=function(a){for(var b=-1,c=this.buffer.byteLength,
e,d="",f="",g="";b<c;){-1!==b&&(e=this.view.getUint8(b),d=16>e?d+("0"+e.toString(16).toUpperCase()):d+e.toString(16).toUpperCase(),a&&(f+=32<e&&127>e?String.fromCharCode(e):"."));++b;if(a&&0<b&&0===b%16&&b!==c){for(;51>d.length;)d+=" ";g+=d+f+"\n";d=f=""}d=b===this.offset&&b===this.limit?d+(b===this.markedOffset?"!":"|"):b===this.offset?d+(b===this.markedOffset?"[":"<"):b===this.limit?d+(b===this.markedOffset?"]":">"):d+(b===this.markedOffset?"'":a||0!==b&&b!==c?" ":"")}if(a&&" "!==d){for(;51>d.length;)d+=
" ";g+=d+f+"\n"}return a?g:d};d.fromDebug=function(a,b,c){var e=a.length;b=new d((e+1)/3|0,b,c);for(var h=0,f=0,g,k=!1,l=!1,p=!1,m=!1,q=!1;h<e;){switch(g=a.charAt(h++)){case "!":if(!c){if(l||p||m){q=!0;break}l=p=m=!0}b.offset=b.markedOffset=b.limit=f;k=!1;break;case "|":if(!c){if(l||m){q=!0;break}l=m=!0}b.offset=b.limit=f;k=!1;break;case "[":if(!c){if(l||p){q=!0;break}l=p=!0}b.offset=b.markedOffset=f;k=!1;break;case "<":if(!c){if(l){q=!0;break}l=!0}b.offset=f;k=!1;break;case "]":if(!c){if(m||p){q=
!0;break}m=p=!0}b.limit=b.markedOffset=f;k=!1;break;case ">":if(!c){if(m){q=!0;break}m=!0}b.limit=f;k=!1;break;case "'":if(!c){if(p){q=!0;break}p=!0}b.markedOffset=f;k=!1;break;case " ":k=!1;break;default:if(!c&&k){q=!0;break}g=parseInt(g+a.charAt(h++),16);if(!c&&(isNaN(g)||0>g||255<g))throw new TypeError("Illegal str: Not a debug encoded string");b.view.setUint8(f++,g);k=!0}if(q)throw new TypeError("Illegal str: Invalid symbol at "+h);}if(!c){if(!l||!m)throw new TypeError("Illegal str: Missing offset or limit");
if(f<b.buffer.byteLength)throw new TypeError("Illegal str: Not a debug encoded string (is it hex?) "+f+" < "+e);}return b};d.prototype.toHex=function(a,b){a="undefined"===typeof a?this.offset:a;b="undefined"===typeof b?this.limit:b;if(!this.noAssert){if("number"!==typeof a||0!==a%1)throw new TypeError("Illegal begin: Not an integer");a>>>=0;if("number"!==typeof b||0!==b%1)throw new TypeError("Illegal end: Not an integer");b>>>=0;if(0>a||a>b||b>this.buffer.byteLength)throw new RangeError("Illegal range: 0 <= "+
a+" <= "+b+" <= "+this.buffer.byteLength);}for(var c=Array(b-a),e;a<b;)e=this.view.getUint8(a++),16>e?c.push("0",e.toString(16)):c.push(e.toString(16));return c.join("")};d.fromHex=function(a,b,c){if(!c){if("string"!==typeof a)throw new TypeError("Illegal str: Not a string");if(0!==a.length%2)throw new TypeError("Illegal str: Length not a multiple of 2");}var e=a.length;b=new d(e/2|0,b);for(var h,f=0,g=0;f<e;f+=2){h=parseInt(a.substring(f,f+2),16);if(!c&&(!isFinite(h)||0>h||255<h))throw new TypeError("Illegal str: Contains non-hex characters");
b.view.setUint8(g++,h)}b.limit=g;return b};var k=function(){var a={j:function(a,c){var e=null;"number"===typeof a&&(e=a,a=function(){return null});for(;null!==e||null!==(e=a());)128>e?c(e&127):(2048>e?c(e>>6&31|192):(65536>e?c(e>>12&15|224):(c(e>>18&7|240),c(e>>12&63|128)),c(e>>6&63|128)),c(e&63|128)),e=null},i:function(a,c){function e(a){a=a.slice(0,a.indexOf(null));var b=Error(a.toString());b.name="TruncatedError";b.bytes=a;throw b;}for(var d,f,g,k;null!==(d=a());)if(0===(d&128))c(d);else if(192===
(d&224))null===(f=a())&&e([d,f]),c((d&31)<<6|f&63);else if(224===(d&240))null!==(f=a())&&null!==(g=a())||e([d,f,g]),c((d&15)<<12|(f&63)<<6|g&63);else if(240===(d&248))null!==(f=a())&&null!==(g=a())&&null!==(k=a())||e([d,f,g,k]),c((d&7)<<18|(f&63)<<12|(g&63)<<6|k&63);else throw RangeError("Illegal starting byte: "+d);},f:function(a,c){for(var e,d=null;null!==(e=null!==d?d:a());)55296<=e&&57343>=e&&null!==(d=a())&&56320<=d&&57343>=d?(c(1024*(e-55296)+d-56320+65536),d=null):c(e);null!==d&&c(d)},g:function(a,
c){var e=null;"number"===typeof a&&(e=a,a=function(){return null});for(;null!==e||null!==(e=a());)65535>=e?c(e):(e-=65536,c((e>>10)+55296),c(e%1024+56320)),e=null},e:function(b,c){a.f(b,function(b){a.j(b,c)})},d:function(b,c){a.i(b,function(b){a.g(b,c)})},k:function(a){if("number"!==typeof a||a!==a)throw TypeError("Illegal byte: "+typeof a);if(-128>a||255<a)throw RangeError("Illegal byte: "+a);return a},l:function(a){if("number"!==typeof a||a!==a)throw TypeError("Illegal char code: "+typeof a);if(0>
a||65535<a)throw RangeError("Illegal char code: "+a);return a},m:function(a){if("number"!==typeof a||a!==a)throw TypeError("Illegal code point: "+typeof a);if(0>a||1114111<a)throw RangeError("Illegal code point: "+a);return a},h:function(a){return 128>a?1:2048>a?2:65536>a?3:4},n:function(b){for(var c,d=0;null!==(c=b());)d+=a.h(c);return d},b:function(b){var c=0,d=0;a.f(b,function(b){++c;d+=a.h(b)});return[c,d]}};return a}(),s=String.fromCharCode;k.a=function(a){var b=0;return function(){return b<
a.length?a.charCodeAt(b++):null}};k.c=function(){var a=[],b=[];return function(){if(0===arguments.length)return b.join("")+s.apply(String,a);1024<a.length+arguments.length&&(b.push(s.apply(String,a)),a.length=0);Array.prototype.push.apply(a,arguments)}};d.prototype.toUTF8=function(a,b){"undefined"===typeof a&&(a=this.offset);"undefined"===typeof b&&(b=this.limit);if(!this.noAssert){if("number"!==typeof a||0!==a%1)throw new TypeError("Illegal begin: Not an integer");a>>>=0;if("number"!==typeof b||
0!==b%1)throw new TypeError("Illegal end: Not an integer");b>>>=0;if(0>a||a>b||b>this.buffer.byteLength)throw new RangeError("Illegal range: 0 <= "+a+" <= "+b+" <= "+this.buffer.byteLength);}var c=this,d;try{k.d(function(){return a<b?c.view.getUint8(a++):null},d=k.c())}catch(h){if(a!==b)throw new RangeError("Illegal range: Truncated data, "+a+" != "+b);}return d()};d.fromUTF8=function(a,b,c){if(!c&&"string"!==typeof a)throw new TypeError("Illegal str: Not a string");var e=new d(k.b(k.a(a),!0)[1],
b,c),h=0;k.e(k.a(a),function(a){e.view.setUint8(h++,a)});e.limit=h;return e};return d}"undefined"!=typeof module&&module.exports?module.exports=s(require("long")):"undefined"!==typeof define&&define.amd?define("ByteBuffer",["Math/Long"],function(l){return s(l)}):(r.dcodeIO||(r.dcodeIO={}),r.dcodeIO.ByteBuffer=s(r.dcodeIO.Long))})(this);

},{"long":88}],87:[function(require,module,exports){
/*
 Copyright 2013 Daniel Wirtz <dcode@dcode.io>
 Copyright 2009 The Closure Library Authors. All Rights Reserved.

 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS-IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.
 */
/**
 * @license Long.js (c) 2013 Daniel Wirtz <dcode@dcode.io>
 * Released under the Apache License, Version 2.0
 * Derived from goog.math.Long from the Closure Library
 * see: https://github.com/dcodeIO/Long.js for details
 */
(function(global) {
    "use strict";

    /**
     * Constructs a 64-bit two's-complement integer, given its low and high 32-bit
     * values as *signed* integers.  See the from* functions below for more
     * convenient ways of constructing Longs.
     *
     * The internal representation of a long is the two given signed, 32-bit values.
     * We use 32-bit pieces because these are the size of integers on which
     * Javascript performs bit-operations.  For operations like addition and
     * multiplication, we split each number into 16-bit pieces, which can easily be
     * multiplied within Javascript's floating-point representation without overflow
     * or change in sign.
     *
     * In the algorithms below, we frequently reduce the negative case to the
     * positive case by negating the input(s) and then post-processing the result.
     * Note that we must ALWAYS check specially whether those values are MIN_VALUE
     * (-2^63) because -MIN_VALUE == MIN_VALUE (since 2^63 cannot be represented as
     * a positive number, it overflows back into a negative).  Not handling this
     * case would often result in infinite recursion.
     * 
     * @exports Long
     * @class A Long class for representing a 64-bit two's-complement integer value.
     * @param {number|!{low: number, high: number, unsigned: boolean}} low The low (signed) 32 bits of the long.
     *  Optionally accepts a Long-like object as the first parameter.
     * @param {number=} high The high (signed) 32 bits of the long.
     * @param {boolean=} unsigned Whether unsigned or not. Defaults to `false` (signed).
     * @constructor
     */
    var Long = function(low, high, unsigned) {
        if (low && typeof low === 'object') {
            high = low.high;
            unsigned = low.unsigned;
            low = low.low;
        }
        
        /**
         * The low 32 bits as a signed value.
         * @type {number}
         * @expose
         */
        this.low = low | 0;

        /**
         * The high 32 bits as a signed value.
         * @type {number}
         * @expose
         */
        this.high = high | 0;

        /**
         * Whether unsigned or not.
         * @type {boolean}
         * @expose
         */
        this.unsigned = !!unsigned;
    };

    // NOTE: Common constant values ZERO, ONE, NEG_ONE, etc. are defined below the from* methods on which they depend.

    // NOTE: The following cache variables are used internally only and are therefore not exposed as properties of the
    // Long class.
    
    /**
     * A cache of the Long representations of small integer values.
     * @type {!Object}
     */
    var INT_CACHE = {};

    /**
     * A cache of the Long representations of small unsigned integer values.
     * @type {!Object}
     */
    var UINT_CACHE = {};

    /**
     * Returns a Long representing the given (32-bit) integer value.
     * @param {number} value The 32-bit integer in question.
     * @param {boolean=} unsigned Whether unsigned or not. Defaults to false (signed).
     * @return {!Long} The corresponding Long value.
     * @expose
     */
    Long.fromInt = function(value, unsigned) {
        var obj, cachedObj;
        if (!unsigned) {
            value = value | 0;
            if (-128 <= value && value < 128) {
                cachedObj = INT_CACHE[value];
                if (cachedObj) return cachedObj;
            }
            obj = new Long(value, value < 0 ? -1 : 0, false);
            if (-128 <= value && value < 128) {
                INT_CACHE[value] = obj;
            }
            return obj;
        } else {
            value = value >>> 0;
            if (0 <= value && value < 256) {
                cachedObj = UINT_CACHE[value];
                if (cachedObj) return cachedObj;
            }
            obj = new Long(value, (value | 0) < 0 ? -1 : 0, true);
            if (0 <= value && value < 256) {
                UINT_CACHE[value] = obj;
            }
            return obj;
        }
    };

    /**
     * Returns a Long representing the given value, provided that it is a finite
     * number.  Otherwise, zero is returned.
     * @param {number} value The number in question.
     * @param {boolean=} unsigned Whether unsigned or not. Defaults to false (signed).
     * @return {!Long} The corresponding Long value.
     * @expose
     */
    Long.fromNumber = function(value, unsigned) {
        unsigned = !!unsigned;
        if (isNaN(value) || !isFinite(value)) {
            return Long.ZERO;
        } else if (!unsigned && value <= -TWO_PWR_63_DBL) {
            return Long.MIN_SIGNED_VALUE;
        } else if (unsigned && value <= 0) {
            return Long.MIN_UNSIGNED_VALUE;
        } else if (!unsigned && value + 1 >= TWO_PWR_63_DBL) {
            return Long.MAX_SIGNED_VALUE;
        } else if (unsigned && value >= TWO_PWR_64_DBL) {
            return Long.MAX_UNSIGNED_VALUE;
        } else if (value < 0) {
            return Long.fromNumber(-value, false).negate();
        } else {
            return new Long((value % TWO_PWR_32_DBL) | 0, (value / TWO_PWR_32_DBL) | 0, unsigned);
        }
    };

    /**
     * Returns a Long representing the 64bit integer that comes by concatenating the given low and high bits. Each is
     *  assumed to use 32 bits.
     * @param {number} lowBits The low 32 bits.
     * @param {number} highBits The high 32 bits.
     * @param {boolean=} unsigned Whether unsigned or not. Defaults to false (signed).
     * @return {!Long} The corresponding Long value.
     * @expose
     */
    Long.fromBits = function(lowBits, highBits, unsigned) {
        return new Long(lowBits, highBits, unsigned);
    };

    /**
     * Returns a Long representing the 64bit integer that comes by concatenating the given low, middle and high bits.
     *  Each is assumed to use 28 bits.
     * @param {number} part0 The low 28 bits
     * @param {number} part1 The middle 28 bits
     * @param {number} part2 The high 28 (8) bits
     * @param {boolean=} unsigned Whether unsigned or not. Defaults to false (signed).
     * @return {!Long}
     * @expose
     */
    Long.from28Bits = function(part0, part1, part2, unsigned) {
        // 00000000000000000000000000001111 11111111111111111111111122222222 2222222222222
        // LLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLL HHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHH
        return Long.fromBits(part0 | (part1 << 28), (part1 >>> 4) | (part2) << 24, unsigned);
    };

    /**
     * Returns a Long representation of the given string, written using the given
     * radix.
     * @param {string} str The textual representation of the Long.
     * @param {(boolean|number)=} unsigned Whether unsigned or not. Defaults to false (signed).
     * @param {number=} radix The radix in which the text is written.
     * @return {!Long} The corresponding Long value.
     * @expose
     */
    Long.fromString = function(str, unsigned, radix) {
        if (str.length == 0) {
            throw(new Error('number format error: empty string'));
        }
        if (str === "NaN" || str === "Infinity" || str === "+Infinity" || str === "-Infinity") {
            return Long.ZERO;
        }
        if (typeof unsigned === 'number') { // For goog.math.Long compatibility
            radix = unsigned;
            unsigned = false;
        }
        radix = radix || 10;
        if (radix < 2 || 36 < radix) {
            throw(new Error('radix out of range: ' + radix));
        }

        if (str.charAt(0) == '-') {
            return Long.fromString(str.substring(1), unsigned, radix).negate();
        } else if (str.indexOf('-') >= 0) {
            throw(new Error('number format error: interior "-" character: ' + str));
        }

        // Do several (8) digits each time through the loop, so as to
        // minimize the calls to the very expensive emulated div.
        var radixToPower = Long.fromNumber(Math.pow(radix, 8));

        var result = Long.ZERO;
        for (var i = 0; i < str.length; i += 8) {
            var size = Math.min(8, str.length - i);
            var value = parseInt(str.substring(i, i + size), radix);
            if (size < 8) {
                var power = Long.fromNumber(Math.pow(radix, size));
                result = result.multiply(power).add(Long.fromNumber(value));
            } else {
                result = result.multiply(radixToPower);
                result = result.add(Long.fromNumber(value));
            }
        }
        result.unsigned = unsigned;
        return result;
    };

    // NOTE: the compiler should inline these constant values below and then remove these variables, so there should be
    // no runtime penalty for these.
    
    // NOTE: The following constant values are used internally only and are therefore not exposed as properties of the
    // Long class.

    /**
     * @type {number}
     */
    var TWO_PWR_16_DBL = 1 << 16;

    /**
     * @type {number}
     */
    var TWO_PWR_24_DBL = 1 << 24;

    /**
     * @type {number}
     */
    var TWO_PWR_32_DBL = TWO_PWR_16_DBL * TWO_PWR_16_DBL;

    /**
     * @type {number}
     */
    var TWO_PWR_31_DBL = TWO_PWR_32_DBL / 2;

    /**
     * @type {number}
     */
    var TWO_PWR_48_DBL = TWO_PWR_32_DBL * TWO_PWR_16_DBL;

    /**
     * @type {number}
     */
    var TWO_PWR_64_DBL = TWO_PWR_32_DBL * TWO_PWR_32_DBL;

    /**
     * @type {number}
     */
    var TWO_PWR_63_DBL = TWO_PWR_64_DBL / 2;

    /**
     * @type {!Long}
     */
    var TWO_PWR_24 = Long.fromInt(1 << 24);

    /**
     * @type {!Long}
     * @expose
     */
    Long.ZERO = Long.fromInt(0);

    /**
     * @type {!Long}
     * @expose
     */
    Long.UZERO = Long.fromInt(0, true);

    /**
     * @type {!Long}
     * @expose
     */
    Long.ONE = Long.fromInt(1);

    /**
     * @type {!Long}
     * @expose
     */
    Long.UONE = Long.fromInt(1, true);

    /**
     * @type {!Long}
     * @expose
     */
    Long.NEG_ONE = Long.fromInt(-1);

    /**
     * @type {!Long}
     * @expose
     */
    Long.MAX_SIGNED_VALUE = Long.fromBits(0xFFFFFFFF | 0, 0x7FFFFFFF | 0, false);

    /**
     * @type {!Long}
     * @expose
     */
    Long.MAX_UNSIGNED_VALUE = Long.fromBits(0xFFFFFFFF | 0, 0xFFFFFFFF | 0, true);

    /**
     * Alias of {@link Long.MAX_SIGNED_VALUE} for goog.math.Long compatibility.
     * @type {!Long}
     * @expose
     */
    Long.MAX_VALUE = Long.MAX_SIGNED_VALUE;

    /**
     * @type {!Long}
     * @expose
     */
    Long.MIN_SIGNED_VALUE = Long.fromBits(0, 0x80000000 | 0, false);

    /**
     * @type {!Long}
     * @expose
     */
    Long.MIN_UNSIGNED_VALUE = Long.fromBits(0, 0, true);

    /**
     * Alias of {@link Long.MIN_SIGNED_VALUE}  for goog.math.Long compatibility.
     * @type {!Long}
     * @expose
     */
    Long.MIN_VALUE = Long.MIN_SIGNED_VALUE;

    /**
     * @return {number} The value, assuming it is a 32-bit integer.
     * @expose
     */
    Long.prototype.toInt = function() {
        return this.unsigned ? this.low >>> 0 : this.low;
    };

    /**
     * @return {number} The closest floating-point representation to this value.
     * @expose
     */
    Long.prototype.toNumber = function() {
        if (this.unsigned) {
            return ((this.high >>> 0) * TWO_PWR_32_DBL) + (this.low >>> 0);
        }
        return this.high * TWO_PWR_32_DBL + (this.low >>> 0);
    };

    /**
     * @param {number=} radix The radix in which the text should be written.
     * @return {string} The textual representation of this value.
     * @override
     * @expose
     */
    Long.prototype.toString = function(radix) {
        radix = radix || 10;
        if (radix < 2 || 36 < radix) {
            throw(new Error('radix out of range: ' + radix));
        }
        if (this.isZero()) {
            return '0';
        }
        var rem;
        if (this.isNegative()) { // Unsigned Longs are never negative
            if (this.equals(Long.MIN_SIGNED_VALUE)) {
                // We need to change the Long value before it can be negated, so we remove
                // the bottom-most digit in this base and then recurse to do the rest.
                var radixLong = Long.fromNumber(radix);
                var div = this.div(radixLong);
                rem = div.multiply(radixLong).subtract(this);
                return div.toString(radix) + rem.toInt().toString(radix);
            } else {
                return '-' + this.negate().toString(radix);
            }
        }

        // Do several (6) digits each time through the loop, so as to
        // minimize the calls to the very expensive emulated div.
        var radixToPower = Long.fromNumber(Math.pow(radix, 6));
        rem = this;
        var result = '';
        while (true) {
            var remDiv = rem.div(radixToPower);
            var intval = rem.subtract(remDiv.multiply(radixToPower)).toInt();
            var digits = intval.toString(radix);
            rem = remDiv;
            if (rem.isZero()) {
                return digits + result;
            } else {
                while (digits.length < 6) {
                    digits = '0' + digits;
                }
                result = '' + digits + result;
            }
        }
    };

    /**
     * @return {number} The high 32 bits as a signed value.
     * @expose
     */
    Long.prototype.getHighBits = function() {
        return this.high;
    };

    /**
     * @return {number} The high 32 bits as an unsigned value.
     * @expose
     */
    Long.prototype.getHighBitsUnsigned = function() {
        return this.high >>> 0;
    };

    /**
     * @return {number} The low 32 bits as a signed value.
     * @expose
     */
    Long.prototype.getLowBits = function() {
        return this.low;
    };

    /**
     * @return {number} The low 32 bits as an unsigned value.
     * @expose
     */
    Long.prototype.getLowBitsUnsigned = function() {
        return this.low >>> 0;
    };

    /**
     * @return {number} Returns the number of bits needed to represent the absolute
     *     value of this Long.
     * @expose
     */
    Long.prototype.getNumBitsAbs = function() {
        if (this.isNegative()) { // Unsigned Longs are never negative
            if (this.equals(Long.MIN_SIGNED_VALUE)) {
                return 64;
            } else {
                return this.negate().getNumBitsAbs();
            }
        } else {
            var val = this.high != 0 ? this.high : this.low;
            for (var bit = 31; bit > 0; bit--) {
                if ((val & (1 << bit)) != 0) {
                    break;
                }
            }
            return this.high != 0 ? bit + 33 : bit + 1;
        }
    };

    /**
     * @return {boolean} Whether this value is zero.
     * @expose
     */
    Long.prototype.isZero = function() {
        return this.high == 0 && this.low == 0;
    };

    /**
     * @return {boolean} Whether this value is negative.
     * @expose
     */
    Long.prototype.isNegative = function() {
        return !this.unsigned && this.high < 0;
    };

    /**
     * @return {boolean} Whether this value is odd.
     * @expose
     */
    Long.prototype.isOdd = function() {
        return (this.low & 1) == 1;
    };

    /**
     * @return {boolean} Whether this value is even.
     */
    Long.prototype.isEven = function() {
        return (this.low & 1) == 0;
    };

    /**
     * @param {Long} other Long to compare against.
     * @return {boolean} Whether this Long equals the other.
     * @expose
     */
    Long.prototype.equals = function(other) {
        if (this.unsigned != other.unsigned && (this.high >>> 31) != (other.high >>> 31)) return false;
        return (this.high == other.high) && (this.low == other.low);
    };

    /**
     * @param {Long} other Long to compare against.
     * @return {boolean} Whether this Long does not equal the other.
     * @expose
     */
    Long.prototype.notEquals = function(other) {
        return !this.equals(other);
    };

    /**
     * @param {Long} other Long to compare against.
     * @return {boolean} Whether this Long is less than the other.
     * @expose
     */
    Long.prototype.lessThan = function(other) {
        return this.compare(other) < 0;
    };

    /**
     * @param {Long} other Long to compare against.
     * @return {boolean} Whether this Long is less than or equal to the other.
     * @expose
     */
    Long.prototype.lessThanOrEqual = function(other) {
        return this.compare(other) <= 0;
    };

    /**
     * @param {Long} other Long to compare against.
     * @return {boolean} Whether this Long is greater than the other.
     * @expose
     */
    Long.prototype.greaterThan = function(other) {
        return this.compare(other) > 0;
    };

    /**
     * @param {Long} other Long to compare against.
     * @return {boolean} Whether this Long is greater than or equal to the other.
     * @expose
     */
    Long.prototype.greaterThanOrEqual = function(other) {
        return this.compare(other) >= 0;
    };

    /**
     * Compares this Long with the given one.
     * @param {Long} other Long to compare against.
     * @return {number} 0 if they are the same, 1 if the this is greater, and -1
     *     if the given one is greater.
     * @expose
     */
    Long.prototype.compare = function(other) {
        if (this.equals(other)) {
            return 0;
        }
        var thisNeg = this.isNegative();
        var otherNeg = other.isNegative();
        if (thisNeg && !otherNeg) return -1;
        if (!thisNeg && otherNeg) return 1;
        if (!this.unsigned) {
            // At this point the signs are the same
            return this.subtract(other).isNegative() ? -1 : 1;
        } else {
            // Both are positive if at least one is unsigned
            return (other.high >>> 0) > (this.high >>> 0) || (other.high == this.high && (other.low >>> 0) > (this.low >>> 0)) ? -1 : 1;
        }
    };

    /**
     * @return {!Long} The negation of this value.
     * @expose
     */
    Long.prototype.negate = function() {
        if (!this.unsigned && this.equals(Long.MIN_SIGNED_VALUE)) {
            return Long.MIN_SIGNED_VALUE;
        }
        return this.not().add(Long.ONE);
    };

    /**
     * Returns the sum of this and the given Long.
     * @param {Long} other Long to add to this one.
     * @return {!Long} The sum of this and the given Long.
     * @expose
     */
    Long.prototype.add = function(other) {
        // Divide each number into 4 chunks of 16 bits, and then sum the chunks.
        
        var a48 = this.high >>> 16;
        var a32 = this.high & 0xFFFF;
        var a16 = this.low >>> 16;
        var a00 = this.low & 0xFFFF;

        var b48 = other.high >>> 16;
        var b32 = other.high & 0xFFFF;
        var b16 = other.low >>> 16;
        var b00 = other.low & 0xFFFF;

        var c48 = 0, c32 = 0, c16 = 0, c00 = 0;
        c00 += a00 + b00;
        c16 += c00 >>> 16;
        c00 &= 0xFFFF;
        c16 += a16 + b16;
        c32 += c16 >>> 16;
        c16 &= 0xFFFF;
        c32 += a32 + b32;
        c48 += c32 >>> 16;
        c32 &= 0xFFFF;
        c48 += a48 + b48;
        c48 &= 0xFFFF;
        return Long.fromBits((c16 << 16) | c00, (c48 << 16) | c32, this.unsigned);
    };

    /**
     * Returns the difference of this and the given Long.
     * @param {Long} other Long to subtract from this.
     * @return {!Long} The difference of this and the given Long.
     * @expose
     */
    Long.prototype.subtract = function(other) {
        return this.add(other.negate());
    };

    /**
     * Returns the product of this and the given long.
     * @param {Long} other Long to multiply with this.
     * @return {!Long} The product of this and the other.
     * @expose
     */
    Long.prototype.multiply = function(other) {
        if (this.isZero()) {
            return Long.ZERO;
        } else if (other.isZero()) {
            return Long.ZERO;
        }

        if (this.equals(Long.MIN_VALUE)) {
            return other.isOdd() ? Long.MIN_VALUE : Long.ZERO;
        } else if (other.equals(Long.MIN_VALUE)) {
            return this.isOdd() ? Long.MIN_VALUE : Long.ZERO;
        }

        if (this.isNegative()) {
            if (other.isNegative()) {
                return this.negate().multiply(other.negate());
            } else {
                return this.negate().multiply(other).negate();
            }
        } else if (other.isNegative()) {
            return this.multiply(other.negate()).negate();
        }
        // If both longs are small, use float multiplication
        if (this.lessThan(TWO_PWR_24) &&
            other.lessThan(TWO_PWR_24)) {
            return Long.fromNumber(this.toNumber() * other.toNumber(), this.unsigned);
        }

        // Divide each long into 4 chunks of 16 bits, and then add up 4x4 products.
        // We can skip products that would overflow.
        
        var a48 = this.high >>> 16;
        var a32 = this.high & 0xFFFF;
        var a16 = this.low >>> 16;
        var a00 = this.low & 0xFFFF;

        var b48 = other.high >>> 16;
        var b32 = other.high & 0xFFFF;
        var b16 = other.low >>> 16;
        var b00 = other.low & 0xFFFF;

        var c48 = 0, c32 = 0, c16 = 0, c00 = 0;
        c00 += a00 * b00;
        c16 += c00 >>> 16;
        c00 &= 0xFFFF;
        c16 += a16 * b00;
        c32 += c16 >>> 16;
        c16 &= 0xFFFF;
        c16 += a00 * b16;
        c32 += c16 >>> 16;
        c16 &= 0xFFFF;
        c32 += a32 * b00;
        c48 += c32 >>> 16;
        c32 &= 0xFFFF;
        c32 += a16 * b16;
        c48 += c32 >>> 16;
        c32 &= 0xFFFF;
        c32 += a00 * b32;
        c48 += c32 >>> 16;
        c32 &= 0xFFFF;
        c48 += a48 * b00 + a32 * b16 + a16 * b32 + a00 * b48;
        c48 &= 0xFFFF;
        return Long.fromBits((c16 << 16) | c00, (c48 << 16) | c32, this.unsigned);
    };

    /**
     * Returns this Long divided by the given one.
     * @param {Long} other Long by which to divide.
     * @return {!Long} This Long divided by the given one.
     * @expose
     */
    Long.prototype.div = function(other) {
        if (other.isZero()) {
            throw(new Error('division by zero'));
        } else if (this.isZero()) {
            return this.unsigned ? Long.UZERO : Long.ZERO;
        }
        var approx, rem, res;
        if (this.equals(Long.MIN_SIGNED_VALUE)) {
            if (other.equals(Long.ONE) || other.equals(Long.NEG_ONE)) {
                return Long.MIN_SIGNED_VALUE;  // recall that -MIN_VALUE == MIN_VALUE
            } else if (other.equals(Long.MIN_SIGNED_VALUE)) {
                return Long.ONE;
            } else {
                // At this point, we have |other| >= 2, so |this/other| < |MIN_VALUE|.
                var halfThis = this.shiftRight(1);
                approx = halfThis.div(other).shiftLeft(1);
                if (approx.equals(Long.ZERO)) {
                    return other.isNegative() ? Long.ONE : Long.NEG_ONE;
                } else {
                    rem = this.subtract(other.multiply(approx));
                    res = approx.add(rem.div(other));
                    return res;
                }
            }
        } else if (other.equals(Long.MIN_SIGNED_VALUE)) {
            return this.unsigned ? Long.UZERO : Long.ZERO;
        }
        if (this.isNegative()) {
            if (other.isNegative()) {
                return this.negate().div(other.negate());
            } else {
                return this.negate().div(other).negate();
            }
        } else if (other.isNegative()) {
            return this.div(other.negate()).negate();
        }
        
        // Repeat the following until the remainder is less than other:  find a
        // floating-point that approximates remainder / other *from below*, add this
        // into the result, and subtract it from the remainder.  It is critical that
        // the approximate value is less than or equal to the real value so that the
        // remainder never becomes negative.
        res = Long.ZERO;
        rem = this;
        while (rem.greaterThanOrEqual(other)) {
            // Approximate the result of division. This may be a little greater or
            // smaller than the actual value.
            approx = Math.max(1, Math.floor(rem.toNumber() / other.toNumber()));

            // We will tweak the approximate result by changing it in the 48-th digit or
            // the smallest non-fractional digit, whichever is larger.
            var log2 = Math.ceil(Math.log(approx) / Math.LN2);
            var delta = (log2 <= 48) ? 1 : Math.pow(2, log2 - 48);

            // Decrease the approximation until it is smaller than the remainder.  Note
            // that if it is too large, the product overflows and is negative.
            var approxRes = Long.fromNumber(approx, this.unsigned);
            var approxRem = approxRes.multiply(other);
            while (approxRem.isNegative() || approxRem.greaterThan(rem)) {
                approx -= delta;
                approxRes = Long.fromNumber(approx, this.unsigned);
                approxRem = approxRes.multiply(other);
            }

            // We know the answer can't be zero... and actually, zero would cause
            // infinite recursion since we would make no progress.
            if (approxRes.isZero()) {
                approxRes = Long.ONE;
            }

            res = res.add(approxRes);
            rem = rem.subtract(approxRem);
        }
        return res;
    };

    /**
     * Returns this Long modulo the given one.
     * @param {Long} other Long by which to mod.
     * @return {!Long} This Long modulo the given one.
     * @expose
     */
    Long.prototype.modulo = function(other) {
        return this.subtract(this.div(other).multiply(other));
    };

    /**
     * @return {!Long} The bitwise-NOT of this value.
     * @expose
     */
    Long.prototype.not = function() {
        return Long.fromBits(~this.low, ~this.high, this.unsigned);
    };

    /**
     * Returns the bitwise-AND of this Long and the given one.
     * @param {Long} other The Long with which to AND.
     * @return {!Long} The bitwise-AND of this and the other.
     * @expose
     */
    Long.prototype.and = function(other) {
        return Long.fromBits(this.low & other.low, this.high & other.high, this.unsigned);
    };

    /**
     * Returns the bitwise-OR of this Long and the given one.
     * @param {Long} other The Long with which to OR.
     * @return {!Long} The bitwise-OR of this and the other.
     * @expose
     */
    Long.prototype.or = function(other) {
        return Long.fromBits(this.low | other.low, this.high | other.high, this.unsigned);
    };

    /**
     * Returns the bitwise-XOR of this Long and the given one.
     * @param {Long} other The Long with which to XOR.
     * @return {!Long} The bitwise-XOR of this and the other.
     * @expose
     */
    Long.prototype.xor = function(other) {
        return Long.fromBits(this.low ^ other.low, this.high ^ other.high, this.unsigned);
    };

    /**
     * Returns this Long with bits shifted to the left by the given amount.
     * @param {number} numBits The number of bits by which to shift.
     * @return {!Long} This shifted to the left by the given amount.
     * @expose
     */
    Long.prototype.shiftLeft = function(numBits) {
        numBits &= 63;
        if (numBits == 0) {
            return this;
        } else {
            var low = this.low;
            if (numBits < 32) {
                var high = this.high;
                return Long.fromBits(low << numBits, (high << numBits) | (low >>> (32 - numBits)), this.unsigned);
            } else {
                return Long.fromBits(0, low << (numBits - 32), this.unsigned);
            }
        }
    };

    /**
     * Returns this Long with bits shifted to the right by the given amount.
     * @param {number} numBits The number of bits by which to shift.
     * @return {!Long} This shifted to the right by the given amount.
     * @expose
     */
    Long.prototype.shiftRight = function(numBits) {
        numBits &= 63;
        if (numBits == 0) {
            return this;
        } else {
            var high = this.high;
            if (numBits < 32) {
                var low = this.low;
                return Long.fromBits((low >>> numBits) | (high << (32 - numBits)), high >> numBits, this.unsigned);
            } else {
                return Long.fromBits(high >> (numBits - 32), high >= 0 ? 0 : -1, this.unsigned);
            }
        }
    };

    /**
     * Returns this Long with bits shifted to the right by the given amount, with
     * the new top bits matching the current sign bit.
     * @param {number} numBits The number of bits by which to shift.
     * @return {!Long} This shifted to the right by the given amount, with
     *     zeros placed into the new leading bits.
     * @expose
     */
    Long.prototype.shiftRightUnsigned = function(numBits) {
        numBits &= 63;
        if (numBits == 0) {
            return this;
        } else {
            var high = this.high;
            if (numBits < 32) {
                var low = this.low;
                return Long.fromBits((low >>> numBits) | (high << (32 - numBits)), high >>> numBits, this.unsigned);
            } else if (numBits == 32) {
                return Long.fromBits(high, 0, this.unsigned);
            } else {
                return Long.fromBits(high >>> (numBits - 32), 0, this.unsigned);
            }
        }
    };

    /**
     * @return {!Long} Signed long
     * @expose
     */
    Long.prototype.toSigned = function() {
        var l = this.clone();
        l.unsigned = false;
        return l;
    };

    /**
     * @return {!Long} Unsigned long
     * @expose
     */
    Long.prototype.toUnsigned = function() {
        var l = this.clone();
        l.unsigned = true;
        return l;
    };
    
    /**
     * @return {Long} Cloned instance with the same low/high bits and unsigned flag.
     * @expose
     */
    Long.prototype.clone = function() {
        return new Long(this.low, this.high, this.unsigned);
    };

    // Enable module loading if available
    if (typeof module != 'undefined' && module["exports"]) { // CommonJS
        module["exports"] = Long;
    } else if (typeof define != 'undefined' && define["amd"]) { // AMD
        define("Math/Long", [], function() { return Long; });
    } else { // Shim
        if (!global["dcodeIO"]) {
            global["dcodeIO"] = {};
        }
        global["dcodeIO"]["Long"] = Long;
    }

})(this);

},{}],88:[function(require,module,exports){
/*
 Copyright 2013 Daniel Wirtz <dcode@dcode.io>
 Copyright 2009 The Closure Library Authors. All Rights Reserved.

 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS-IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.
 */

module.exports = require("./dist/Long.js");

},{"./dist/Long.js":87}],89:[function(require,module,exports){
var debug = false;

function pubKeyMatch (ar1, ar2){
  if (!ar1){
    return true;
  }
  for(var i = 0; i < ar1.length; i++ ){
    if (ar1[i] !== ar2[i]){
      return false;
    }
  }
  return true;
}


/** Default EntryClass for ContentStore
 *@constructor
 *@private
 *@param {Buffer} element the raw data packet.
 *@param {Data} data the ndn.Data object
 */
function csEntry (element, data){
  var freshnessPeriod = data.getMetaInfo().getFreshnessPeriod();
  this.name = data.name;
  this.element = element;
  this.freshnessPeriod = freshnessPeriod;
  this.uri = data.name.toUri();
  this.publisherPublicKeyDigest = data.signedInfo.publisher.publisherPublicKeyDigest;
  return this;
}

/**
 *@property {String} type a type string describing the type of entry
 */
csEntry.type = "csEntry";

/** sync/async getter for the element
 *@private
 *@param {function} callback Recieves element as only argument
 *@returns {Buffer} element the raw data packet
 */
csEntry.prototype.getElement = function(callback){
  callback = callback || function(e){return e;};
  return callback(this.element);
};

/**
 *@private
 *@param {NameTreeNode} node the node to remove this entry from
 *@returns {csEntry} entry the csEntry in case you want to do something other than throw it away
 */
csEntry.prototype.stale = function(node){
  delete node.csEntry;
  return this;
};

/**A ContentStore constructor for building cache's and database indexes
 *@constructor
 *@param {NameTree} nameTree the nameTree to build upon
 *@param {constructor} entryClass a constructor class conforming to the same API as {@link csEntry}.
 *@returns {ContentStore} - a new store
 */
function ContentStore(nameTree, entryClass){
  this.nameTree = nameTree;
  this.EntryClass = entryClass || csEntry;
  return this;
}

/**check the ContentStore for data matching a given interest (including min/max suffix, exclude, publisherKey)
 *@param {ndn.Interest} interest the interest to match against
 *@param {function=} callback for asynchronous cases (like levelDB). recieves return value as only argument
 *@returns {Buffer | null}
 */
ContentStore.prototype.check = function(interest, callback, node, suffixCount, childTracker, stack){
  callback = callback || function(element){return element;};
  node = node || this.nameTree.lookup(interest.name);
  stack = stack || 1;
  stack++;
  if (stack++ > Object.keys(this.nameTree).length * 2){
    console.log("stack over");
    return callback(null);
  }

  var self = this;

  if (node[this.EntryClass.type]
      && interest.matchesName(node[this.EntryClass.type].name)
      && pubKeyMatch(interest.publisherPublicKeyDigest, node[this.EntryClass.type].publisherPublicKeyDigest)
     ){
    return node[this.EntryClass.type].getElement(callback);
  }



  suffixCount = suffixCount || 0;
  childTracker = childTracker || [];

  var maxSuffix = interest.getMaxSuffixComponents()
    , minSuffix = interest.getMinSuffixComponents()
    , childSelector = interest.getChildSelector()
    , atMaxSuffix = (maxSuffix && (suffixCount === maxSuffix))
    , hasChildren = (node.children.length > 0)
    , hasMoreSiblings = function(node){
      if (debug) {console.log(childTracker.length, node.parent.children.length, childTracker[childTracker.length - 1] );}
      return  (!!childTracker.length && !!node.parent && (node.parent.children.length > childTracker[childTracker.length - 1] + 1));
    };

  if (debug) {console.log(node.prefix.toUri(), interest.name.toUri(), childTracker, hasMoreSiblings(node));}

  function toChild(node){
    if (debug) {console.log("toChild", childTracker);}
    suffixCount++;
    childTracker.push(0);
    if (!childSelector){ //leftmost == 0 == falsey

      return self.check(interest, callback, node.children[0], suffixCount, childTracker , stack++);
    } else {

      return self.check(interest, callback, node.children[node.children.length - 1], suffixCount, childTracker, stack++);
    }
  }

  function toSibling(node){
    if (debug) {console.log("toSibling from ", node.prefix.toUri(), childTracker, node);}
    childTracker[childTracker.length - 1]++;

    if (!childSelector){
      if (debug) {console.log(node.prefix.toUri(), childTracker, node.parent.children[childTracker[childTracker.length - 1]].prefix.toUri());}
      return self.check(interest, callback, node.parent.children[childTracker[childTracker.length - 1]], suffixCount, childTracker, stack++);
    } else {
      if (debug) {console.log(node.prefix.toUri(), childTracker, node.parent.children[node.parent.children.length  + ~childTracker[childTracker.length - 1]].prefix.toUri());}
      return self.check(interest, callback, node.parent.children[node.parent.children.length  + ~childTracker[childTracker.length - 1]], suffixCount, childTracker, stack++);
    }
  }

  function toAncestorSibling(node, stack){
    if (debug) {console.log("toAncestorSibling from ",node.prefix.toUri(), childTracker);}
    suffixCount--;
    childTracker.pop();
    if (stack++ > 10000){
      return callback(null);
    }

    var hasParentSibling = (node.parent && node.parent.parent && node.parent.parent.children.length > childTracker[childTracker.length - 1] + 1);

    if (hasParentSibling){
      return toSibling(node.parent);
    } else if (childTracker.length >0) {
      return toAncestorSibling(node.parent, stack++);
    } else {
      return callback(null);
    }
  }

  if (childTracker.length === 1){
    if (interest.exclude.matches(node.prefix.get(-1))){
      if (hasMoreSiblings(node)){
        return toSibling(node);
      } else {
        return callback(null);
      }
    }
  }



  if (!node.prefix.size() ||(!atMaxSuffix && hasChildren)){
    return toChild(node);
  } else if (hasMoreSiblings(node)){
    return toSibling(node);
  } else if (childTracker.length > 1){
    return toAncestorSibling(node);
  } else{
    return callback(null);
  }
};

/**Insert a new entry into the contentStore
 *@constructor
 *@param {Buffer} element the raw data packet
 *@param {ndn.Data} data the ndn.Data object
 *@returns {ContentStore} - for chaining
 */
ContentStore.prototype.insert = function(element, data){
  var Entry = this.EntryClass;
  var freshness = data.getMetaInfo().getFreshnessPeriod();
  var node = this.nameTree.lookup(data.name)
  , entry = new Entry(element, data);
  node[Entry.type] = entry;
  node[Entry.type].nameTreeNode = node;
  setTimeout(function(){
    if (node[Entry.type]) {node[Entry.type].stale(node);}
  }, freshness || 20 );
  return this;
};


module.exports = ContentStore;

},{}],90:[function(require,module,exports){
var binarySearch = require("./../Utility/binarySearch.js")
  , ndn;

/**A Forwarding Entry
 *@constructor
 *@param {Object|string} prefix - the ndn.Name object representing the prefix for this forwarding entry
 *@param {Array} - an array of nextHop objects, each with a "faceID" integer property, or just an array of the faceIDs
 *@returns {FibEntry}
 */
function FibEntry(prefix, nextHops){
  this.prefix = (typeof prefix === "string") ? new ndn.Name(prefix) : prefix ;

  this.nextHops = (function(){
    var hops = [];
    function recurse(){
      if (nextHops && nextHops.length > 0){
        var hop = (nextHops[0].faceID) ? nextHops.shift() : {faceID: nextHops.shift()};
        var i = binarySearch(hops, hop, "faceID");
        if (i < 0){
          hops.splice(~i, 0, hop);
        }
        return recurse();
      } else{
        return hops;
      }
    }
    return recurse();
  })();
  return this;
}

/**get all nextHops, excluding a given faceID
 *@param {Number=} excludingFaceID the faceID to exclude
 *@returns {Array} an array of nextHops
 */
FibEntry.prototype.getNextHops = function(excludingFaceID){
  if(excludingFaceID !== undefined){
    var q = {faceID: excludingFaceID }
      , i = binarySearch(this.nextHops, q, "faceID");
    if (i >= 0){
      return this.nextHops.slice(0,i).concat(this.nextHops.slice(i + 1));
    } else {
      return this.nextHops;
    }
  } else {
    return this.nextHops;
  }
};

/**Add a nextHop (will replace if a nextHop with the same faceID exists)
 *@param {Object} nextHop an object with faceID Number property
 *@returns {FIBEntry}
 */
FibEntry.prototype.addNextHop = function(nextHop){
  var i = binarySearch(this.nextHops, nextHop, "faceID");

  if (i < 0){
    this.nextHops.splice(~i, 0, nextHop);
    return this;
  } else{
    this.nextHops.splice(i,1,nextHop);
    return this;
  }
};

/**Forwarding Interest Base
 *@constructor
 *@param {@link NameTree} nameTree the nameTree to build the FIB on.
 */
function FIB (nameTree){
  this.nameTree = nameTree; return this;
}

/**Install ndn-lib into the FIB scope. only necessary if you require("ndn-Classes/src/DataStructures/FIB.js"), done for you if require("ndn-Classes").FIB
 *@private
 *@param {Object} NDN ndn-js library as exported by npm
 */
FIB.installNDN = function(NDN){
  ndn = NDN;
  return this;
};

/**find the exact match fibEntry for a given prefix, creating it if not found
 *@param {Object} prefix the ndn.Name object representing the prefix
 *@returns {FIBEntry}
 */
FIB.prototype.lookup = function(prefix){
  prefix = (typeof prefix === "string") ? new ndn.Name(prefix) : prefix;

  var ent = this.nameTree.lookup(prefix)
    , entry = ent.fibEntry;

  if (entry){
    return entry;
  }else{
    return (ent.fibEntry = new FIB.FibEntry({prefix: prefix, nextHops: []}));
  }
};

/**Return an Iterator that progressively returns longest prefix FIBEntries with 1 or more nextHops
 *@param {Object} prefix the ndn.Name object representing the prefix
 *@returns {Object} Iterator object with .next() and .hasNext = Boolean
 */
FIB.prototype.findAllFibEntries = function(prefix){

  var inner =  this.nameTree.findAllMatches(prefix, function(match){
    if (match.fibEntry && (match.fibEntry.nextHops.length > 0)){
      return true;
    }  else {
      return false;
    }
  })
  , iterouter = {
    hasNext : inner.hasNext
    , next : function(){
      var next = inner.next();

      if (inner.hasNext){
        this.hasNext = true;
      } else {
        this.hasNext = false;
      }
      return next.fibEntry;
    }
  };
  return iterouter;
};

/**Convenience method to get a faceFlag representing all nextHop faces for all prefixes of a given prefix
 *@param {Object|String} prefix ndn.Name Object or NDN URI string to lookup
 *@param {Number=} excludingFaceID faceID to exclude from results
 *@returns {Number} - a faceFlag for use with {@link Interfaces.dispatch}
 */
FIB.prototype.findAllNextHops = function(prefix, excludingFaceID){
  prefix = (typeof prefix === "string") ? new ndn.Name(prefix) : prefix;
  var faceFlag = 0
    , iterator = this.findAllFibEntries(prefix);

  while (iterator.hasNext){
    var entry = iterator.next()
      , nextHops = entry.getNextHops(excludingFaceID);
    for (var i =0; i < nextHops.length; i ++){
      faceFlag = faceFlag | (1 << nextHops[i].faceID);
    }
  }
  return faceFlag;
};

/**Add a FIBEntry
 *@param {Object} -
 *
 */

FIB.prototype.addEntry = function(prefix, nextHops){
  var fibEntry = new FibEntry(prefix, nextHops);

  var node = this.nameTree.lookup(fibEntry.prefix);
  if (!node.fibEntry){
    node.fibEntry = fibEntry;
    return this;
  } else {
    for (var i = 0 ; i < fibEntry.nextHops.length; i++ ){
      var j = binarySearch(node.fibEntry.nextHops, fibEntry.nextHops[i], "faceID");
      if (j < 0){
        node.fibEntry.nextHops.splice(~j, 0, fibEntry.nextHops[i]);
      }
    }
    return this;
  }
};

FIB.Entry = FibEntry;

module.exports = FIB;

},{"./../Utility/binarySearch.js":97}],91:[function(require,module,exports){
var ndn
  , Face
  , ndn = require("ndn-lib")
  , TlvDecoder = require("ndn-lib/js/encoding/tlv/tlv-decoder.js").TlvDecoder
  , Tlv = require("ndn-lib/js/encoding/tlv/tlv.js").Tlv;

/**Interface manager
 *@constructor
 *@param {Subject} Subject - a {@link Subject} instance
 *@returns {Interfaces} - a new Interface manager
 */
function Interfaces(Subject){

  this.subject = Subject;
  this.transports = {};
  Face = ndn.Face;

  return this;
}

/**Class method to install ndn-lib. Only necessary if you require("ndn-classes/src/DataStructures/Interfaces.js"), done for you if require('ndn-classes').Interfaces
 *@private
 *@param {Object} - NDN the ndn-lib object
 */
Interfaces.installNDN = function(NDN){
  ndn = NDN;
  return this;
};

Interfaces.prototype.transports = {};

Interfaces.prototype.Faces = [];

/**Install a transport Class to the Interfaces manager. If the Class has a Listener function, the Listener will be invoked
 *@param {Transport} Transport a Transport Class matching the Abstract Transport API
 *@returns {Interfaces} for chaining
 */
Interfaces.prototype.installTransport = function(Transport){
  this.transports[Transport.prototype.name] = Transport;

  if (Transport.Listener){
    Transport.Listener(this.newFace);
  }

  return this;
};

/**Create a new Face
 *@param {String} protocol a string matching the .protocolKey property of a previously installed {@link Transport}
 *@param {Object} connectionParameters the object expected by the transport class
 *@returns {Number} id the numerical faceID of the created Face.
 */
Interfaces.prototype.newFace = function(protocol, connectionParameters, onopen, onclose) {
  var Self = this;

  if (!this.transports[protocol]){
    return -1;
  } else {
    var Transport = new this.transports[protocol](connectionParameters)
      , newFace =  new ndn.Face(Transport, Transport.connectionInfo);

    this.Faces.push(newFace);
    newFace.faceID = this.Faces.length - 1;

    newFace.transport.connect(newFace.connectionInfo, newFace, function(){
      newFace.onReceivedElement = function(element){
        //console.log("onReceivedElement")
        var decoder = new TlvDecoder(element);
        if (decoder.peekType(Tlv.Interest, element.length)) {
          Self.subject.handleInterest(element, this.faceID);
        }
        else if (decoder.peekType(Tlv.Data, element.length)) {
          Self.subject.handleData(element, this.faceID);
        }
      };

      newFace.send = function(element){
        this.transport.send(element);
      };

      if (onopen) {onopen();}
    }, function(){
      //onclose event TODO
      if (onclose) {onclose();}
    });
    return newFace.faceID;
  }
};

/** Dispatch an element to one or more Faces
 *@param {Buffer} element the raw packet to dispatch
 *@param {Number} faceFlag an Integer representing the faces to send one
 *@param {Function} callback called per face sent, used for testing
 *@returns {Interfaces} for chaining
 */
Interfaces.prototype.dispatch = function(element, faceFlag, callback){
  if (faceFlag){
    for (var i = 0; i < faceFlag.toString(2).length; i++){
      if (faceFlag & (1<<i) ){
        this.Faces[i].send(element);
        if (callback){
          callback(i);
        }
      }
    }
  }
  return this;
};

module.exports = Interfaces;

},{"ndn-lib":24,"ndn-lib/js/encoding/tlv/tlv-decoder.js":40,"ndn-lib/js/encoding/tlv/tlv.js":43}],92:[function(require,module,exports){
var NameTreeNode = require("./NameTreeNode.js")
  , binaryIndexOf = require("./../Utility/binarySearch.js")
  , ndn
  , debug = require("./../Utility/debug.js").NameTree;

/**Creates an empty NameTree.
 *@constructor
 */
function NameTree (){
  this.addNode('/');
  return this;
}

NameTree.Node = NameTreeNode;


/**Install ndn-lib. Only necessary if you're using require("ndn-Classes/src/DataStructures/NameTree.js"), done for you if require("ndn-Classes").NameTree
 *@private
 *@param {Object} NDN ndn-lib object
 */
NameTree.installNDN = function(NDN){
  NameTree.Node.installNDN(NDN);
  ndn = NDN;
  return this;
};

/**
 * Add a node to the NameTree, recursively populating all parents
 * @param  {Name|String} prefix - the prefix for the new node.
 * @returns {NameTreeNode} node - the NameTree node created.
 */
NameTree.prototype.addNode = function(prefix){
  if (typeof prefix === "string"){
    prefix = new ndn.Name(prefix);
  }
  var self = this[prefix.toUri()];
  if(self){
    return self;
  } else {
    self = this[prefix.toUri()] = new NameTree.Node(prefix);
    while(prefix.size() > 0){
      var parentPrefix = prefix.getPrefix(-1);

      if(!this[parentPrefix.toUri()]){
        this[parentPrefix.toUri()] = new NameTree.Node(parentPrefix);
      }
      this[prefix.toUri()].parent = this[parentPrefix.toUri()];
      this[parentPrefix.toUri()].addChild(this[prefix.toUri()]);
      prefix = parentPrefix;
    }
  }
  return self;
};

/**
 * Delete a node (and all it's children, grandchildren, etc.).
 * @param   {Name|URI} prefix - the name of the node to delete.
 * @returns {NameTree} the nameTree.
 */
NameTree.prototype.removeNode = function(prefix, cycleFinish){
  if (typeof prefix === "string"){
    prefix = new ndn.Name(prefix);
  }
  cycleFinish = cycleFinish || prefix;
  var self = this[prefix.toUri()];

  if (!self){
    return this;
  } else{
    var child = self.children.shift();

    if (child !== undefined){
      return this.removeNode(child.prefix, cycleFinish);
    } else {
      delete this[self.prefix.toUri()];
      if (cycleFinish.equals(prefix)){
        self.parent.removeChild(self);
        return this;
      }
      else{
        return this.removeNode(prefix.getPrefix(-1), cycleFinish);
      }
    }
  }
};

/**
 * Perform a lookup on the NameTree and return the proper node, creating it if necessary.
 * @param  {Name|URI} prefix the name of the node to lookup.
 * @returns {NameTreeNode} the resulting node.
 */
NameTree.prototype.lookup = function (prefix) {
  if (typeof prefix === "string"){
    prefix = new ndn.Name(prefix);
  }
  var node = this[prefix.toUri()];

  if (node){
    return node;
  } else{
    return (this.addNode(prefix));
  }
};

/**
 * Find the Longest Prefix Match in the NameTree that matches the selector
 * @param    {Name|URI} prefix the name to lookup
 * @param    {function} selector predicate function
 * @returns  {NameTreeNode} the longest prefix match.
 */
NameTree.prototype.findLongestPrefixMatch = function(prefix, selector) {
  if (typeof prefix === "string"){
    prefix = new ndn.Name(prefix);
  }
  selector = selector || function(){return true;};

  var match = this[prefix.toUri()];
  if ( match && selector(match)){
    return match;
  } else if (prefix.size() > 0){
    return this.findLongestPrefixMatch(prefix.getPrefix(-1), selector);
  } else {
    return null;
  }
};

/**
 * Return an Iterator that provides a .next() method which returns the next longest Prefix matching the selector, returning null when depleted.
 * @param {Name} prefix - the prefix to begin iteration
 * @param {Function} selector - a selector function that returns a boolean when called with selector(node)
 * @returns {Object} Iterator - the .depleted property of the iterator will be true when there are no more matches.
 */
NameTree.prototype.findAllMatches = function(prefix, selector){
  if (typeof prefix === "string"){
    prefix = new ndn.Name(prefix);
  }
  selector = selector || function(){return true;};

  var self = this
    , nextReturn = self[prefix.toUri()]
    , thisReturn
    , iterator = {
      next: function(){
        if (!this.hasNext){
          return null;
        }
        prefix = nextReturn.prefix;
        thisReturn = nextReturn;
        nextReturn = (thisReturn && thisReturn.parent && selector(thisReturn.parent)) ?
          thisReturn.parent
        : (prefix.size() > 0) ?
          self.findLongestPrefixMatch(prefix.getPrefix(-1), selector)
        : null ;
        if (!nextReturn){
          this.hasNext = false;
        } else {
          this.hasNext = true;
        }
        return thisReturn;
      }
    };

  if (nextReturn && selector(nextReturn)){
    iterator.hasNext = true;
    return iterator;
  } else if (prefix.size() > 0){
    return this.findAllMatches(prefix.getPrefix(-1), selector);
  } else{
    return null;
  }
};

module.exports = NameTree;

},{"./../Utility/binarySearch.js":97,"./../Utility/debug.js":98,"./NameTreeNode.js":93}],93:[function(require,module,exports){
var binarySearch = require("./../Utility/binarySearch.js")
  , ndn
  , debug = require("./../Utility/debug.js");

/**NameTreeNode constructor, NOTE: (typeof URI == "string") && (Name instanceof <a href="https://github.com/named-data/ndn-js/blob/master/js/name.js">ndn.Name</a> )
 *@constructor
 *@private
 *@param {Name|URI} prefix of the node
 *@returns {NameTreeNode}
 */
function NameTreeNode (prefix) {
  this.prefix     = (typeof prefix === "string") ? new ndn.Name(prefix) : (prefix || null);
  this.parent     = null;
  this.children   = [];
  this.fibEntry   = null;
  this.pitEntries = [];
  this.measurements  = null;
  this.strategy = null;
  return this;
}

/**Install ndn-lib. Only necessary if you're using require("ndn-Classes/src/DataStructures/NameTreeNode.js"), done for you if require("ndn-Classes").NameTree.Node
 *@private
 *@param {Object} NDN ndn-lib object
 */
NameTreeNode.installNDN = function(NDN){
  ndn = NDN;
  return this;
};

/**Add a child node to this one, inserting at the properly sorted index according to canonical namespace rules
 *@private
 *@param {NameTreeNode | String} child - the node to insert, or the suffix for a new node.
 *@returns {NameTreeNode} the original node
 */
NameTreeNode.prototype.addChild = function addChild(child){
  var self  = this
    , index = binarySearch(this.children, child.prefix.get(-1), "prefix");

  child = (child.prefix) ? child : new NameTreeNode(new ndn.Name(self.prefix).append(child));
  if ( index < 0){
    if (debug.NameTree) {
      console.log("adding child " + child.prefix.toUri()+ " to "+ self.prefix.toUri() + " at index " +~index);
    }
    this.children.splice(~index, 0, child);
  }
  return this;
};

/**Remove a child from this node. This won't derefrence the child node, just remove it from the index
 *@private
 *@param {NameTreeNode | String} child - the node to remove, or the suffix of that node.
 *@returns {NameTreeNode} the original node
 */
NameTreeNode.prototype.removeChild = function(child){
  child = (typeof child === "string") ? {prefix:  new ndn.Name(child)} : child;

  var index = binarySearch(this.children, child.prefix.get(-1), "prefix");
  if (index < 0){
    return this;
  } else {
    this.children.splice(index, 1);
    return this;
  }
};


module.exports = NameTreeNode;

},{"./../Utility/binarySearch.js":97,"./../Utility/debug.js":98}],94:[function(require,module,exports){
var binarySearch = require("./../Utility/binarySearch.js")
  , ndn;


function pubKeyMatch (ar1, ar2){
  if (!ar1){
    return true;
  }

  for(var i = 0; i < ar1.length; i++ ){
    if (ar1[i] !== ar2[i]){
      return false;
    }
  }
  return true;
}

/**PIT Entry
 *@constructor
 *@param {Buffer} element The raw interest data packet
 *@param {Object=} interest the ndn.Interest Object
 *@param {number|function} faceIDorCallback Either the faceID of the face this interest was received on, or a callback function to receive any matching data
 *@returns {PitEntry} - the entry
 */
function PitEntry (element, interest, faceIDorCallback){
  if (typeof interest !== "object"){
    faceIDorCallback = interest;
    interest = new ndn.Interest();
    interest.wireDecode(element);
  }
  if (!interest.nonce){
    interest.wireDecode(element);
  }
  this.nonce = interest.nonce;
  this.uri = interest.name.toUri();
  this.interest = interest;
  this.element = element;
  if (typeof faceIDorCallback === "function" ){
    this.callback = faceIDorCallback;
  } else {
    this.faceID = faceIDorCallback;
  }
  return this;
}

/**Test whether the PitEntry is fulfilled by a data object
 *@param {Object} data the ndn.Data object
 *@returns {Boolean}
 */
PitEntry.prototype.matches = function(data){
  if (this.interest.matchesName(data.name)
     && pubKeyMatch(this.interest.publisherPublicKeyDigest, data.signedInfo.publisher.publisherPublicKeyDigest)
     ){
    return true;
  } else {
    return false;
  }
};

/**Consume the PitEntry (assuming it is attached to a the nameTree)
 *@returns {PitEntry} in case you want to do anything with it afterward
 */
PitEntry.prototype.consume = function() {
  if (this.nameTreeNode){
    var i = binarySearch(this.nameTreeNode.pitEntries, this, "nonce");
    if (i >= 0){
      var removed = this.nameTreeNode.pitEntries.splice(~i, 1)[0];
      if (removed.callback){
        removed.callback(null, removed.interest);
      }
    }
  }
  return this;
};




/**Pending Interest Table
 *@constructor
 *@param {NameTree} nameTree the nameTree to build the table on top of
 *@returns {PIT} a new PIT
 */
PIT = function(nameTree){
  this.nameTree = nameTree;
  return this;
};

/**Import ndn-lib into the PIT scope
 *@param {Object} NDN the NDN-js library in object form
 */
PIT.installNDN = function(NDN){
  ndn = NDN;
  return this;
};

PIT.Entry = PitEntry;

PIT.prototype.useNameTree = function(nameTree){
  this.nameTree = nameTree;
  return this;
};

/**Create and insert a new {@link PITEntry}
 *@param {Buffer} element The raw interest data packet
 *@param {Object=} interest the ndn.Interest object
 *@param {Number|function} faceIDorCallback either a numerical faceID or a callbackFunction
 *@returns {PIT} the PIT (for chaining)
 */
PIT.prototype.insertPitEntry = function(element, interest, faceIDorCallback){
  var pitEntry = new PIT.Entry(element, interest, faceIDorCallback);

  setTimeout(function(){
    pitEntry.consume();
  }, pitEntry.interest.getInterestLifetimeMilliseconds() || 10);
  var node = this.nameTree.lookup(pitEntry.interest.name);

  var i = binarySearch(node.pitEntries, pitEntry, "nonce");
  if (i < 0){
    pitEntry.nameTreeNode = node;
    node.pitEntries.splice(~i, 0 ,pitEntry);
  }
  return this;
};

/**Lookup the PIT for Entries matching a given data object
 *@param {Object} data The ndn.Data object
 *@returns {Object} results: an object with two properties, pitEntries and faces, which are
 * an array of matching {@link PITEntry}s and
 * an integer faceFlag for use with {@link Interfaces.dispatch}, respectively.
 */
PIT.prototype.lookup = function(data, name, matches, faceFlag){
  name = name || data.name;
  matches = matches || [];
  faceFlag = faceFlag || 0;

  var pitEntries = this.nameTree.lookup(name).pitEntries;

  for (var i = 0; i < pitEntries.length; i++){
    if (pitEntries[i].matches(data)){
      matches.push(pitEntries[i]);
      faceFlag = faceFlag | (1 << pitEntries[i].faceID);
    }
  }

  if (name.size() > 0){
    return this.lookup(data, name.getPrefix(-1), matches, faceFlag);
  } else{
    return {pitEntries : matches, faces : faceFlag};
  }
};

module.exports = PIT;

},{"./../Utility/binarySearch.js":97}],95:[function(require,module,exports){
exports.MessageChannel = require("./browser/MessageChannel.js");
module.exports = exports;

},{"./browser/MessageChannel.js":96}],96:[function(require,module,exports){
(function (Buffer){
var ElementReader = require("ndn-lib/js/encoding/element-reader.js").ElementReader;
var Transport = require("ndn-lib/js/transport/transport.js").Transport;

MessageChannelTransport.protocolKey = "messageChannel";

/**Transport Class for HTML5 MessageChannels
 *@constructor
 *@param {MessageChannel_Port} port one end of an HTML MessageChannel
 *@returns {MessageChannelTransport}
 */
function MessageChannelTransport (port) {
  Transport.call(this);
  this.connectionInfo = new MessageChannelTransport.ConnectionInfo(port);
  return this;
}


MessageChannelTransport.prototype = new Transport();
MessageChannelTransport.prototype.name = "messageChannelTransport";

MessageChannelTransport.ConnectionInfo = function MessageChannelTransportConnectionInfo(port){
  console.log(Transport);
  Transport.ConnectionInfo.call(this);
  this.port = port;
};

MessageChannelTransport.ConnectionInfo.prototype = new Transport.ConnectionInfo();
MessageChannelTransport.ConnectionInfo.prototype.name = "MessageChannelTransport.ConnectionInfo";

MessageChannelTransport.ConnectionInfo.prototype.getPort = function()
{
  return this.port;
};

MessageChannelTransport.ConnectionInfo.prototype.equals = function(other)
{
  if (other === null || other.port === undefined){
    return false;
  }
  return (this.port === other.port);
};

/**Set the event listener for incoming elements
 *@param {Object} face the ndn.Face object that this transport is attached to
 *@param {function} onopenCallback a callback to be performed once the transport is open
 */
MessageChannelTransport.prototype.connect = function(connectionInfo, elementListener, onopenCallback, onclosedCallback)
{
  console.log("messageChannel connect");
  this.elementReader = new ElementReader(elementListener);
  var self = this;
  connectionInfo.getPort().onmessage = function(ev) {
    if (ev.data.buffer instanceof ArrayBuffer) {
      try {
        self.elementReader.onReceivedData(new Buffer(ev.data));
      } catch (ex) {
        console.log("NDN.ws.onmessage exception: ", ex);
        return;
      }
    }
  };
  //elementListener.readyStatus = 2
  onopenCallback();
};

/**Send the Uint8Array data.
 *@param {Buffer} element the data packet
 */
MessageChannelTransport.prototype.send = function(element)
{
  this.connectionInfo.getPort().postMessage(element);
};

module.exports = MessageChannelTransport;

}).call(this,require("buffer").Buffer)
},{"buffer":3,"ndn-lib/js/encoding/element-reader.js":35,"ndn-lib/js/transport/transport.js":74}],97:[function(require,module,exports){
  /**
 * Modified from https://gist.github.com/Wolfy87/5734530
 *
 *
 * Performs a binary search on the host array. This method can either be
 * injected into Array.prototype or called with a specified scope like this:
 * binaryIndexOf.call(someArray, searchElement);
 *
 * @param {*} searchElement The item to search for within the array.
 * @return {Number} The index of the element which defaults to -1 when not found.
 */

var debug = require("./debug.js").binaryIndexOf

function compareArrays(query, comparator, i){
  if (!(i >= 0))
    i = -1

  if (i >= 0 || (query.length == comparator.length)){
    i++
    if (comparator[i] > query[i]){
      return 1;
    } else if (comparator[i] < query[i]) {
      return -1;
    } else if (query[i] == comparator[i]){
      if (i < query.length - 1)
        return compareArrays(query, comparator, i);
      else
        return 0;
    }
  } else if (comparator.length > query.length){
    return 1;
  } else if (comparator.length < query.length){
    return -1;
  }

}


var binaryIndexOfPrefix = function(array, searchElement, prop) {
	'use strict';
  if (array.length == 0){
    return -1;}

	var minIndex = 0;
	var maxIndex = array.length - 1;
	var currentIndex;
	var currentElement;
	var resultIndex;
  var res;

  searchElement = (prop == "prefix") ?
    searchElement.getValue().buffer
  : (prop == "nonce") ?
    searchElement.nonce
  : (prop == "faceID") ?
    searchElement.faceID
  : searchElement

	while (minIndex <= maxIndex) {
		resultIndex = currentIndex = (minIndex + maxIndex) / 2 | 0;
    currentElement = (prop == "prefix") ? array[currentIndex].prefix.get(-1).getValue().buffer : (prop == "nonce") ? array[currentIndex].nonce : (prop == "faceID") ? array[currentIndex].faceID : array[currentIndex]

    res = (typeof searchElement !== "number") ? compareArrays(searchElement, currentElement) : (function(){
      if (searchElement > currentElement)
        return -1;
      if (searchElement < currentElement)
        return 1;
      else
        return 0
    })()


		if (res == 1) {
			maxIndex = currentIndex - 1;
		}
		else if (res == -1) {
      minIndex = currentIndex + 1;
		}
		else {
			return currentIndex;
		}
	}
  return ~(maxIndex + 1);
}

module.exports = binaryIndexOfPrefix

},{"./debug.js":98}],98:[function(require,module,exports){
module.exports = {
  NameTree : false
  ,binaryIndexOf : true
}

},{}],99:[function(require,module,exports){
module.exports=require(29)
},{"../log.js":107,"../util/ndn-protoco-id-tags.js":111,"../util/ndn-time.js":112,"./data-utils.js":101,"./decoding-exception.js":102,"buffer":3}],100:[function(require,module,exports){
module.exports=require(31)
},{"../util/dynamic-buffer.js":110,"./binary-xml-decoder.js":99}],101:[function(require,module,exports){
module.exports=require(33)
},{"buffer":3}],102:[function(require,module,exports){
module.exports=require(34)
},{}],103:[function(require,module,exports){
module.exports=require(35)
},{"../log.js":107,"./binary-xml-structure-decoder.js":100,"./data-utils.js":101,"./tlv/tlv-structure-decoder.js":105,"./tlv/tlv.js":106}],104:[function(require,module,exports){
module.exports=require(40)
},{"../decoding-exception.js":102}],105:[function(require,module,exports){
module.exports=require(42)
},{"./tlv-decoder.js":104,"buffer":3}],106:[function(require,module,exports){
module.exports=require(43)
},{}],107:[function(require,module,exports){
module.exports=require(53)
},{}],108:[function(require,module,exports){
module.exports=require(74)
},{}],109:[function(require,module,exports){
module.exports=require(75)
},{"../encoding/element-reader.js":103,"../log.js":107,"./transport.js":108,"buffer":3,"net":2}],110:[function(require,module,exports){
module.exports=require(78)
},{"buffer":3}],111:[function(require,module,exports){
module.exports=require(81)
},{}],112:[function(require,module,exports){
module.exports=require(82)
},{"../log.js":107}],113:[function(require,module,exports){
/*
var io = {}
  , ndn = require("ndn-lib")
  , utils = require('ndn-utils')
  , messageChannelTransport = require("ndn-message-channel-transport")
  , self

/*
io.initBuffer = []
var keyManager = function() {

  this.certificate = null
  this.publicKey = null
  this.privateKey = null

  this.key = null;
};
keyManager.prototype.getKey = function()
{
  if (this.key === null) {
    this.key = new ndn.Key();
    this.key.fromPemString(this.publicKey, this.privateKey);
  }

  return this.key;
}

ndn.globalKeyMangager =  new keyManager()

io.remoteTangle = function(){}

io.useNDN = function(n){
  ndn = n
}

io.initFace = function(transportClass, portStreamOrWebSocket, ack){
  console.log(transportClass, portStreamOrWebSocket, ack)
  if ((typeof transportClass == "string") && (transportClass == "websocket" || "tcp")){
    io.face = new ndn.Face({host:portStreamOrWebSocket.host, port: portStreamOrWebSocket.port})
  } else {
    console.log("local local")
    io.face = new ndn.Face({host:1337, port:1337, getTransport:function(){return new messageChannelTransport.transport(portStreamOrWebSocket)}})
  }
  io.face.transport.connect(io.face, function(){
    console.log("io face connected")
    if (io.initBuffer.length > 0){
      for (var i = 0; i < io.initBuffer.length; i++){
        var action = io.initBuffer[i]
        if (action.type = "expressInterest")
          io.face.expressInterest(action.interest, action.onData, action.onTimeout)
      }
    }
    ack()
  })
}

io.telehashTangle = function(opts){

  io.initFace(null, opts.hashname, function(){})

}

io.remoteTangle = function(opts, cb){
  if (opts.transport == 'telehash'){
    io.telehashTangle(opts)
  } else {
    io.initFace(opts.transport, opts, cb)
  }
}

io.importPKI = function(cert, priPem, pubPem) {
  ndn.globalKeyManager.certificate = cert
  ndn.globalKeyManager.publicKey = pubPem
  ndn.globalKeyManager.privateKey = priPem
}

io.getHashname = function() {
  return ndn.globalKeyManager.getKey().publicKeyDigest.toString('hex');
}

io.makeFace = function(opts, responder) {

var d, enc, inst, name, onData, onInterest, onTimeout, param;

  console.log("make face'");

  name = new ndn.Name("localhost/nfd/faces/create");

  d = new ndn.Data(new ndn.Name(''), new ndn.SignedInfo(), JSON.stringify(opts));

  d.signedInfo.setFields();

  d.sign();

  enc = d.wireEncode();

  name.append(enc.buffer);

  inst = new ndn.Interest(name);

  onData = function(interest, data){
    console.log("makeFace got Response", data)
    var response = JSON.parse(data.content.toString())
    opts.faceID = response.faceID
    responder(opts, true)
  }

  onTimeout = function(interest) {
    console.log("makeFace timeout", opts.host || opts.hashname)
    responder(opts, false)
  }
  io.face.expressInterest(inst, onData, onTimeout);
}
io.addNextHop = function(opts, cb) {
  var d, enc, inst, name, onData, onInterest, onTimeout, param;

  console.log("registering own face'");

  name = new ndn.Name("localhost/nfd/fib/add-nexthop");

  param = {
    uri: opts.uri
  };
  if (opts.faceID) {
    param.faceID = opts.faceID
  }


  console.log("nexthop uri:", param.uri);

  d = new ndn.Data(new ndn.Name(''), new ndn.SignedInfo(), JSON.stringify(param));

  d.signedInfo.setFields();

  d.sign();

  enc = d.wireEncode();

  name.append(enc.buffer);

  inst = new ndn.Interest(name);

  onData = function(interest, data, something) {
    var registeredPrefix;
    console.log("got data from io.addNextHop", data)
    if (JSON.parse(data.content.toString()).success === true)  {
      cb(opts, true)
    }
  };

  onTimeout = function(name, interest, something) {
    return console.log('timeout for add nexthop', name, interest, something);
    cb(opts, false)
  };

  io.face.expressInterest(inst, onData, onTimeout);

}

io.mirror = function(uri){
    var onTimeout = function (interest) {
      console.log("timeout", interest);
    };
    var onData = function(data) {
      console.log(data)
    };
    //console.log(name.toUri())
    var command = new ndn.Name(uri)
    command.append(new ndn.Name.Component([0xc1, 0x2e, 0x52, 0x2e, 0x73, 0x77]))
    var interest = new ndn.Interest(command)
    interest.interestLifetime = 4000
    utils.setNonce(interest)
    //console.log("did this time correctly?", command.toUri())
    io.face.expressInterest(interest, onData, onTimeout);
}

io.makeEncoded = function(data, responder) {
  var d = new ndn.Data(new ndn.Name(data.uri), new ndn.SignedInfo(), data.bytes)
  d.signedInfo.setFields()
  d.sign()
  var encoded = d.encode()
  responder(data.id, encoded)

}
io.fetch = function(opts, responder) {
  console.log(opts)
  var returnName;
  var interestsInFlight = 0;
  var windowSize = 4;
  var t0 = new Date().getTime()
  var segmentRequested = [];
  var whenNotGottenTriggered = false

  var name = new ndn.Name(opts.uri)



  var contentArray = [];

  var recievedSegments = 0;

  segmentRequested[interestsInFlight] = 0;

  var masterInterest = new ndn.Interest(name)


  if (opts.selectors != undefined) {
    if (opts.selectors.publisherPublicKeyDigest != undefined) {
      masterInterest.publisherPublicKeyDigest = new ndn.PublisherPublicKeyDigest(opts.selectors.publisherPublicKeyDigest);
    }
    if (opts.selectors.exclude != undefined) {
      var comps = []
      for (var i = 0; i < opts.selectors.exclude.length; i++) {
        comps[i] = new ndn.Name.Component(opts.selectors.exclude[i])
      }
      masterInterest.exclude = new ndn.Exclude(comps)
    }
    if (opts.selectors.interestLifetime != undefined) {
      masterInterest.setInterestLifetimeMilliseconds(opts.selectors.interestLifetime)
    } else {
      masterInterest.setInterestLifetimeMilliseconds(300);
    }
    if (opts.selectors.child == "right")
      masterInterest.setChildSelector(1)
    else if (opts.selectors.child == "left")
      masterInterest.setChildSelector(0)
  } else {
    masterInterest.setInterestLifetimeMilliseconds(250);
  }

  var interest = new ndn.Interest(masterInterest);

  //console.log(interest.interestLifetime)

  var firstCo;
  var onData = function(interest, co) {
    interestsInFlight--;
    //console.log(interest)

    var segmentNumber = utils.getSegmentInteger(co.name)
    if (segmentNumber == 0) {
      firstCo = co
      returnName = firstCo.name.getPrefix(-1)
    }
    var finalSegmentNumber = 1 + ndn.DataUtils.bigEndianToUnsignedInt(co.signedInfo.finalBlockID);
    //console.log(segmentNumber, co.name.toUri());
    if (contentArray[segmentNumber] == undefined) {
      if (opts.type == 'object') {
        contentArray[segmentNumber] = (ndn.DataUtils.toString(co.content));
      } else if (opts.type == 'blob' || 'file'){
        contentArray[segmentNumber] = co.content;
      }

      recievedSegments++;
    }

    //console.log(recievedSegments, finalSegmentNumber, interestsInFlight);
    if (recievedSegments == finalSegmentNumber) {
        //console.log('got all segment', contentArray.length);
        var t1 = new Date().getTime()
        console.log(t1 - t0)
        if (opts.type == "object") {
          assembleObject(name);
        } else if (opts.type == "blob" || "file") {
          assembleBlob(name)
        } else {
          assembleBlob(name, opts.type)
        }

    } else {
      if (interestsInFlight < windowSize) {
        for (var i = 0; i < finalSegmentNumber; i++) {
          if ((contentArray[i] == undefined) && (segmentRequested[i] == undefined)) {
            var newInterest = new ndn.Interest(masterInterest)
            newInterest.name.appendSegment(i)
            io.face.expressInterest(newInterest, onData, onTimeout)
            segmentRequested[i] = 0;
            interestsInFlight++
            if (interestsInFlight == windowSize) {
              //stop iterating
              i = finalSegmentNumber;
            };
          };
        };
      };
    };
  };
  var onTimeout = function(interest) {
    var seg = utils.getSegmentInteger(interest.name)
    if (segmentRequested[seg] < 4) {
      segmentRequested[seg]++
      var newInterest = new ndn.Interest(interest);
      console.log(masterInterest.interestLifetime)
      newInterest.setInterestLifetimeMilliseconds(masterInterest.interestLifetime)
      io.face.expressInterest(newInterest, onData, onTimeout)

    } else if ((whenNotGottenTriggered == false)) {
      whenNotGottenTriggered = true;
      console.log(segmentRequested)
      responder(opts.uri, false)
    }
  };

  var assembleBlob = function(name, mime) {
    var mime = mime
    var blob = new Blob(contentArray, {type: mime})
    responder(opts.uri, true, blob, firstCo.name.getPrefix(-1).toUri())
  };

  var assembleObject = function(name) {
    var string = "";
    for (var i = 0; i < contentArray.length; i++) {
      string += contentArray[i];
    };
    var obj = JSON.parse(string);
    responder(opts.uri, true, obj, firstCo.name.getPrefix(-1).toUri())
  };



  //console.log(interest.name.toUri())
  if (io.face == undefined){
    io.initBuffer.push({type: "expressInterest", interest: interest, onData: onData, onTimeout: onTimeout})
  } else {
    io.face.expressInterest(interest, onData, onTimeout);
  }


};

io.publishFile = require("./node/publishFile.js")

io.chunkObject = function(opts) {
  var ndnArray = [];
  //console.log(name)
  if (opts.type == 'object') {
    var string = JSON.stringify(opts.thing);
  }
  var name = new ndn.Name(opts.uri)
  if (opts.version != undefined) {
    name.appendVersion(Date.now())
  }
  var stringArray = string.match(/.{1,1300}/g);
  var segmentNames = [];
  for (i = 0; i < stringArray.length; i++) {
    segmentNames[i] = new ndn.Name(name).appendSegment(i)
    var co = new ndn.Data(segmentNames[i], new ndn.SignedInfo(), stringArray[i]);
    co.signedInfo.setFields()
    co.signedInfo.setFinalBlockID(new ndn.Name.Component(utils.initSegment(stringArray.length - 1)))

    if (opts.freshness != undefined) {
      co.signedInfo.setFreshnessPeriod(opts.freshness)
    }
    co.sign()
    ndnArray[i] = co.wireEncode()
  };

  return {array:ndnArray, name: name};

};


io.ping = function(opts){
  var interest = new ndn.Interest(new ndn.Name(opts.uri))
  io.face.expressInterest(interest, function(){}, function(){})
}


io.publishObject = function(opts, responder) {
  var returns = io.chunkObject(opts)
  var name = returns.name
  var ndnArray = returns.array

  var onInterest = function(prefix, interest, transport) {
    var requestedSegment = utils.getSegmentInteger(interest.name)
    console.log("got object interest!!!!", ndnArray[requestedSegment])
    transport.send(ndnArray[requestedSegment].buffer)
  };
  var prefix = name

  function sendWriteCommand() {
    var onTimeout = function (interest) {
      console.log("timeout", interest.toUri());
      responder(opts.uri, false)
    };
    var onData = function(interest, data) {
      console.log("got data in writecommand interest " + interest.name.toUri())
      if (data.content.toString() == "content stored"){
        responder(opts.uri, true)
      }
    };
    var closure = new ndn.Face.CallbackClosure(null, null, onInterest, prefix, io.face.transport);
    ndn.Face.registeredPrefixTable.push(new RegisteredPrefix(prefix, closure));
    console.log("prefix!!!!!!!!!!!!!!!!",prefix.toUri())
    var command = (new ndn.Name(name)).getPrefix(-2).append(new ndn.Name.Component([0xc1, 0x2e, 0x52, 0x2e, 0x73, 0x77])).append(name.getSubName(name.size() - 2));
    console.log(command)
    var interest = new ndn.Interest(command)
    console.log(interest)
    interest.setInterestLifetimeMilliseconds(1000)
    console.log("did this time correctly?" + interest.name.toUri())
    io.face.expressInterest(interest, onData, onTimeout);

  };
  setTimeout(sendWriteCommand, 0)
};

io.addListener = function(opts, responder){
  var prefix = new ndn.Name(opts.uri)

  function onInterest(prefix, interest, transport){
    responder(opts, interest.name.toUri())
  }
  function cb(opts, bool){
    if (bool == false)
      responder(opts, false)
    else {
      var closure = new ndn.Face.CallbackClosure(null, null, onInterest, prefix, io.face.transport);
      ndn.Face.registeredPrefixTable.push(new RegisteredPrefix(prefix, closure));
    }
  }
  io.addNextHop(opts, cb)
}

io.publish = function (opts, responder) {
  console.log(JSON.stringify(opts))
  function afterNextHopAdded(){
    if (opts.type== "object") {
      io.publishObject(opts, responder)
    } else if (opts.type == "file" || "blob" ) {
      io.publishFile(opts, responder, ndn, io)
    }
  }
  io.addNextHop(opts, afterNextHopAdded)

}

function cb() {
  var keyName = new ndn.Name('/%C1.M.S.localhost/%C1.M.SRV/ndnd/KEY')
  var inst = new ndn.Interest(keyName)

}
var RegisteredPrefix = function RegisteredPrefix(prefix, closure)
{
  this.prefix = prefix;        // String
  this.closure = closure;  // Closure
};

*/
var contrib = require("ndn-contrib")
  , Interfaces = contrib.Interfaces
  , NameTree = contrib.NameTree
  , PIT = contrib.PIT
  , ContentStore = contrib.ContentStore
  , Publisher = require("./Publisher.js")
  , FIB = contrib.FIB
  , ndn = contrib.ndn;


/**
 *@constructor
 *@param {Transport} transportClass a transport class
 *@param {Object} connectionParameters the necessary connection info for the given class
 *@return {io}
 */
function IO (transportClass, connectionParameters, contentStore){
  this.interfaces = new Interfaces(this);
  this.interfaces.installTransport(transportClass);
  this.interfaces.newFace(transportClass.prototype.name, connectionParameters);
  this.nameTree = (contentStore) ? contentStore.nameTree : new NameTree();
  this.PIT = new PIT(this.nameTree);
  this.FIB = new FIB(this.nameTree);
  this.contentStore = contentStore || new ContentStore(this.nameTree);
  this.ndn = ndn;
  return this;
}


IO.localTransport = require("ndn-lib/js/transport/unix-transport.js");

/** Publish a file, json object or string
 *@param {Buffer|Blob|File|FilePath|JSON|String} toPublish the thing you want to publish
 *@param {String|ndn.Name} name the name to publish the data under (excluding segment)
 */
IO.prototype.publish = function(toPublish, name, freshnessMilliseconds){
  this.publisher = this.publisher || new Publisher(this);

  return this.publisher.setToPublish(toPublish)
             .setName(name)
             .setFreshnessPeriod(freshnessMilliseconds)
             .publish(this.announcer);
};

/** settable announce function. Rather than enforce a handshake naming convention/protocol
 * it is up to application developer convention to negotiate storage request handshakes.
 * This function is called within {IO.publish} after the data is in the contentStore
 *@param {Object} firstData the ndn.Data object of the first segment data packet
 */
IO.prototype.announcer = function(firstData){};

/** set the announcer function
  *@param {function} announcer
  *@returns {this} this for chaining
  */
IO.prototype.setAnnouncer = function(announcer){
  this.announcer = announcer;
  return this;
};

/** create an IPC face and a forwarding entry to send interest packets to a listener in the main thread
 *@param {String} prefix the uri of the prefix to listen on
 *@param {Class} connectionParameters to use with IO.localTransport (unix in Node, MessageChannel in browser)
 *@returns {this} this for chaining
 */
IO.prototype.addListener = function(prefix, connectionParameters){

  this.FIB.addEntry(prefix, [{
    faceID: this.Interfaces.newFace(IO.LocalTransport, connectionParameters)
  }]);
};

/** handler for incoming interests
 *@param {Buffer} element the raw interest packet
 *@param {number} faceID the integer faceID of the receiving face
 */
IO.prototype.handleInterest = function(element, faceID){
  var interest = new ndn.Interest();
  interest.wireDecode(element);
  this.contentStore.check(interest, function(result){
    if (result){
      this.interfaces.dispatch(result, faceID);
    } else {
      var dispatchFlag = this.FIB.findAllNextHops(interest.name.toUri());
      if (dispatchFlag !== 0){
        this.interfaces.dispatch(element, dispatchFlag);
      }
    }
  });
};

/**handler for incoming data
 *@param {Buffer} element the raw data packet
 *@param {number} faceID the integer faceID of the receiving face
 */
IO.prototype.handleData = function(element, faceID){
  var data = new ndn.Data();
  data.wireDecode(element);
  var results = this.PIT.lookup(data);
  for (var i = 0; i < results.pitEntries.length; i++){
    results.pitEntries[i].callback(element, data, data.signedInfo.finalBlockID);
  }
};

/** fetch all segments of any data, excecuting the callback with each packet
 *@param {Interest} firstSegmentInterest the interest for the first segment of a data item
 *@param {function} onEachData function to call with each incoming data packet, recieves the raw packet, the ndn.Data object, and the finalBlockID of the item
 *@param {function} onTimeout function to call if the entire object can't be retrieved, passed the firstSegmentInterest as the only argument
 */
IO.prototype.fetchAllSegments = function(firstSegmentInterest, onEachData, onTimeout){
  var interestsInFlight = 0
    , windowSize = 4
    , masterInterest = new ndn.Interest(firstSegmentInterest.name.getPrefix(-1), firstSegmentInterest)
    , finalSegmentNumber
    , interest = new ndn.Interest(masterInterest)
    , timeoutTriggered = false
    , segmentRequested = []
    , Self = this;

  var callback = function(element, data, finalBlockID) {
    //console.log("callback")
    if (!element){
      var interest = data;
      var seg = ndn.DataUtils.bigEndianToUnsignedInt(interest.name.get(-1).getValue().buf());
      if (segmentRequested[seg] < 4) {
        segmentRequested[seg]++;
        var packet = interest.wireEncode().buffer;
        Self.PIT.insertPitEntry(packet, interest, callback);
        Self.interfaces.dispatch(packet, 1);
      } else if ((timeoutTriggered === false)) {
        timeoutTriggered = true;
        onTimeout(firstSegmentInterest);
      }
    } else {
      //console.log("element returned", data.name.toUri(), finalBlockID)
      onEachData(element, data, finalBlockID);

      interestsInFlight--;

      var segmentNumber =  ndn.DataUtils.bigEndianToUnsignedInt(data.name.get(-1).getValue().buf());

      finalSegmentNumber = 1 + ndn.DataUtils.bigEndianToUnsignedInt(data.signedInfo.getFinalBlockIDAsBuffer());
      //console.log("finalSegmentNumber", finalSegmentNumber);

      if (interestsInFlight < windowSize) {
        var p;
        for (var i = 0; i < finalSegmentNumber; i++) {
          if (segmentRequested[i] === undefined) {

            var newInterest = new ndn.Interest(masterInterest);

            newInterest.name.appendSegment(i);
            p = newInterest.wireEncode();
            segmentRequested[i] = 0;
            Self.PIT.insertPitEntry(p, newInterest, callback);
            Self.interfaces.dispatch(p, 1);


            interestsInFlight++;
            if (interestsInFlight === windowSize) {
              i = finalSegmentNumber;
            }
          }
        }
      }
    }
  };

  segmentRequested[0] = 0;
  var packet = firstSegmentInterest.wireEncode().buffer;
  firstSegmentInterest = new ndn.Interest();
  firstSegmentInterest.wireDecode(packet);
  this.PIT.insertPitEntry(packet, firstSegmentInterest, callback);
  this.interfaces.dispatch(packet, 1);
  //console.log("dispatched");
};

module.exports = IO;

},{"./Publisher.js":114,"ndn-contrib":14,"ndn-lib/js/transport/unix-transport.js":109}],114:[function(require,module,exports){
(function (Buffer){
var ndn;

if (!File){
  var File = function File(){}
    , Blob = function Blob(){};
}

/** Publisher object for files
 *@constructor
 *@param {IO} io the IO instance
 *@param {String} name the uri to publish the object as
 *@param {File|Blob|Buffer|FilePath|String|Object} toPublish the thing to publish
 *@param {Number} freshnessPeriod the freshnessPeriod of the published data in milliseconds (default 1 hour)
 *@returns {Publisher}
 */
function Publisher (io, name, toPublish, freshnessPeriod){
  this.contentStore = io.contentStore;
  this.toPublish = toPublish || null;
  this.name = (name) ? new ndn.Name(name) : null;
  this.freshnessPeriod = freshnessPeriod || 60 * 60 * 1000;
  return this;
}

/** import ndn-lib into Class scope
 *@static
 *@param {Object} NDN the ndn-lib object
 */

Publisher.installNDN = function(NDN){
  ndn = NDN;
};

/** set the freshnessPeriod of data to publish
 *@param {Number} milliseconds freshness period of published packets
 *@returns {this} for chaining
 */
Publisher.setFreshnessPeriod = function(milliseconds){
  this.freshnessPeriod = milliseconds;
  return this;
};

/** set the thing to publish
 *@oaram {File|Blob|Buffer|FilePath|String|Object} toPublish the thing to publish
 *@returns {this} this for chaining
 */
Publisher.setToPublish = function(toPublish){
  this.toPublish = toPublish;
  return this;
};

/** set the name to publish
 *@oaram {String} name the uri to publish as
 *@returns {this} this for chaining
 */
Publisher.setName = function(name){
  this.name = new ndn.Name(name);
  return this;
};

/** publish the data
 *@param {Function=} callback
 *@returns {this} this for chaining
 */
Publisher.prototype.publish = function(callback){
  callback = callback || function(){};
  if ((this.toPublish instanceof File || Blob || Buffer) || ((typeof this.toPublish === "string") && (this.toPublish.indexOf("file://") === 0))){
    callback(this.publishFile(this.toPublish, this.name));
  } else if (typeof this.toPublish === "string"){
    callback(this.publishString(this.toPublish, this.name));
  } else if (typeof this.toPublish === "object"){
    callback(this.publishJSON(this.toPublish, this.name));
  }
  return this;
};

/** read a file, Buffer, Blob, or Filepath into a buffer
 *@private
 *@param {File|Blob|Buffer|FilePath} file a handle to the file/blob/buffer
 *@returns {Buffer}
 */
Publisher.prototype.readFile = require("./node/readFile.js");

/** read, chunk, name, sign, encode, insert into contentStore
 *@private
 *@returns {Object} firstData the ndn.Data packet of the first content Object, signed and marked with final
 */
Publisher.prototype.publishFile = function(){
  var buffer = this.readFile(this.toPublish)
    , length = Math.ceil(buffer.length / 8000)
    , firstData;

  for (var i = 0; i < length; i++){
    var n = new ndn.Name(this.name);
    n.appendSegment(i);

    var chunk = buffer.slice(i * 8000, (i + 1) * 8000)
      , d = new ndn.Data(n, new ndn.SignedInfo(), chunk);
    d.signedInfo.setFreshnessPeriod(this.freshnessPeriod);

    d.signedInfo.setFinalBlockID(new ndn.Name.Component(ndn.DataUtils.nonNegativeIntToBigEndian(length - 1)));
    this.contentStore.insert(d.wireEncode().buffer, d);
    if (i === 0){
      firstData = d;
    }
  }

  return firstData;
};

/** stringify and call Pubisher.publishString
 *@private
 *@returns {Object} firstData the ndn.Data packet of the first content Object, signed and marked with final
 */
Publisher.prototype.publishJSON = function(){
  return this.setToPublish(JSON.stringify(this.toPublish))
             .publishString();

};

/** chunk, name, sign, encode, insert into contentStore
 *@private
 *@returns {Object} firstData the ndn.Data packet of the first content Object, signed and marked with final
 */
Publisher.prototype.publishString = function(){
  var chunks = []
    , firstData;

  while (this.toPublish.length > 0){
    chunks.push(this.toPublish.substr(0,8000));
    this.toPublish = this.toPublish.substr(8000, this.toPublish.length);
  }

  var length = chunks.length;
  for (var i = 0; i < length; i++){
    var n = new ndn.Name(name);
    var d = new ndn.Data(n.appendSegment(i), new ndn.SignedInfo(), chunks.shift());
    d.signedInfo.setFreshnessPeriod(this.freshnessPeriod);
    d.signedInfo.setFinalBlockID(new ndn.Name.Component(ndn.DataUtils.nonNegativeIntToBigEndian(length - 1)));
    d.sign();
    this.contentStore.insert(d.wireEncode().buffer, d);
    if (i === 0){
      firstData = d;
    }
  }

  return firstData;
};

module.exports = Publisher;

}).call(this,require("buffer").Buffer)
},{"./node/readFile.js":"eE9h1p","buffer":3}],"eE9h1p":[function(require,module,exports){
(function (Buffer){

module.exports = function(file){
  var buffer;
  if (file instanceof File){
    var reader = new FileReaderSync();
    buffer = reader.readAsArrayBuffer(file);
  } else if (file instanceof Blob || Buffer){
    buffer = file;
  }
  return buffer;
};

}).call(this,require("buffer").Buffer)
},{"buffer":3}],"./src/node/readFiles.js":[function(require,module,exports){
module.exports=require('eE9h1p');
},{}],117:[function(require,module,exports){
(function (global){
var IO = require('../../index.js')
  , transportClass = require("ndn-contrib/src/Transports/browser/MessageChannel.js")
  , IO1
  , Interfaces = require("ndn-contrib/src/DataStructures/Interfaces.js");

var dat = []


var ms = new MessageChannel()
IO1 = new IO(transportClass, ms.port1)
var ndn = IO1.ndn;

for (var i = 0 ; i < 100; i++){
  var n = new ndn.Name("test/1/1")
  n.appendSegment(i);
  var d = new ndn.Data(n, new ndn.SignedInfo(), "test");
  d.signedInfo.setFinalBlockID([0,99])
  d.signedInfo.setFields()
  d.sign()
  dat[i] = d.wireEncode().buffer;
}

global.ndn = ndn;
global.IO1 = IO1;

describe('IO', function(){
  describe('constructor', function(){
    it('should start without error without contentStore', function() {
      assert(IO1.interfaces, ".Interfaces not present")
      assert(IO1.nameTree, ".nameTree not present")
      assert(IO1.contentStore, ".contentStore not present")
    })
  })
  describe("fetchAllSegments", function(){
    it("should trigger onTimeout once", function(done){
      var n = new ndn.Name("test/1/1")
      n.appendSegment(0)
      var inst = new ndn.Interest(n)
      inst.setInterestLifetimeMilliseconds(10);

      IO1.fetchAllSegments(inst, function(){assert(false)}, function(){
        done();
      })
    })
    it("should call onEachData once and only once", function(done){
      var count = 0

      var n = new ndn.Name("test/1/1")
      n.appendSegment(0)
      var inst = new ndn.Interest(n)
      inst.setInterestLifetimeMilliseconds(1000);
      console.log(IO1.interfaces)
      var sent = []
      IO2 = new Interfaces({
        handleInterest: function(element, faceID){
          //console.log("handle interest called")
          var inst = new ndn.Interest()
          inst.wireDecode(element)
          var seg = ndn.DataUtils.bigEndianToUnsignedInt(inst.name.get(-1).getValue().buf());
          if (!sent[seg]){
            sent[seg] = true
            console.log("sending segment", seg)
            IO2.dispatch(dat[seg], (0 | (1<<faceID)));
          }
        },
        handleData: function(element, faceID){

        }
      });

      IO2.installTransport(transportClass)
      IO2.newFace(transportClass.prototype.name, ms.port2)
      global.IO2 = IO2;
      IO1.fetchAllSegments(inst, function(){
        count++
        console.log(count)
        assert(count <= 100, "count greater than 100")
        if (count == 100){
          done()
        }
      }, function(){
        console.log("timeout triggered")
        //assert(false, "timeout should not be triggered")
      })
    })
  })
})


}).call(this,typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"../../index.js":1,"ndn-contrib/src/DataStructures/Interfaces.js":91,"ndn-contrib/src/Transports/browser/MessageChannel.js":96}]},{},[117])