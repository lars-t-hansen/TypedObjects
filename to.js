// TypedObject polyfill (partial but growing).
//
// Things that have not been implemented because they are expensive:
//
//  - Proper range checking on access: All getters and setters should
//    throw on OOB, I think.  Now, we just read undefined values, as
//    for TypedArray accesses.
//
//  - Hash-consing of objects: When creating two views on a buffer the
//    resulting objects should be == but here they are not.  We
//    absolutely do not want to hash-cons when the reference does not
//    escape or is not used for equality testing, since that will
//    force a boxing, and we must hash-cons when an object may be used
//    for equality testing.  But that can't be expressed in JS.
//
// For other things, search for TODO below.

// See end for the definition of the TypedObject module object.
// Everything else is internal.

const _TO_INT8 = 0;
const _TO_UINT8 = 1;
const _TO_INT16 = 2;
const _TO_UINT16 = 3;
const _TO_INT32 = 4;
const _TO_UINT32 = 5;
const _TO_FLOAT32 = 6;
const _TO_FLOAT64 = 7;
const _TO_STRUCT = 8;
const _TO_ANY = 9;		// Not supported - transparent objs only, see later
const _TO_OBJECT = 10;		// Not supported - transparent objs only, see later
const _TO_STRING = 11;		// Not supported - transparent objs only, see later

const _cookie = {};

const _structArrayType = function() {
    // TODO: implement this
    throw new Error("struct arrays not supported yet");
}

// TODO: It's possible "any", "object", and "string" could be
// supported using some type of weak map where the value stored in
// memory is an integer key inside that map (and for "any", also a
// tag).  But since I'm only planning to support transparent objects,
// there's no need for these anyway.

const _structType = function(fields, options) {
    if (!options || typeof options != "object")
	options = {};

    if (options.defaults) {
	// TODO: Also see struct assignment.  Defaults are not needed
	// for Type.view() or struct assignment, only once we support
	// non-transparent types.
	throw new Error("Defaults not supported yet");
    }

    let proto = {};
    let offs = 0;
    let align = 1;
    for ( let name in fields ) {
	if (!fields.hasOwnProperty(name))
	    continue;
	let type = fields[name];
	let prop = null;
	offs = (offs + (type.align - 1)) & ~(type.align - 1);
	switch (type.tag) {
	case _TO_INT8:
	    prop = _getterSetter(type, offs);
	    break;
	case _TO_UINT8:
	    prop = _getterSetter(type, offs);
	    break;
	case _TO_INT16:
	    prop = _getterSetter(type, offs);
	    break;
	case _TO_UINT16:
	    prop = _getterSetter(type, offs);
	    break;
	case _TO_INT32:
	    prop = _getterSetter(type, offs);
	    break;
	case _TO_UINT32:
	    prop = _getterSetter(type, offs);
	    break;
	case _TO_FLOAT32:
	    prop = _getterSetter(type, offs);
	    break;
	case _TO_FLOAT64:
	    prop = _getterSetter(type, offs);
	    break;
	case _TO_STRUCT:
	    prop = { get: _getterStruct(type, offs), set: _setterStruct(type, offs) };
	    break;
	case _TO_ANY:
	case _TO_OBJECT:
	case _TO_STRING:
	    throw new Error("Opaque type not supported: " + type.toSource());
	default:
	    throw new Error("Unknown field type: " + type.toSource());
	}
	Object.defineProperty(proto, name, prop);
	if (type.tag == _TO_STRUCT)
	    align = 8;
	else
	    align = Math.max(align, type.size);
	offs += type.size;
    }

    offs = (offs + (align - 1)) & ~(align - 1);

    let constructor = _toConstructor();
    proto._length = offs;
    constructor.prototype = proto;

    // TODO: Hide these properties (also inside _numberType and _invalType)
    constructor.view = options.transparent ? _toView(align, constructor) : _toViewIllegal();
    constructor.tag = _TO_STRUCT;
    constructor.typeName = "structure";
    constructor.size = offs;
    constructor.align = align;

    return constructor;
}

const _toConstructor = function() {
    return function (v1, v2, v3) {
	if (v1 === _cookie) {
	    this._mem = v2;
	    this._offset = v3;
	}
	else {
	    // TODO: implement this, then expose the buffer.
	    throw new Error("Only instantiation onto a pre-existing buffer is supported yet");
	}
    }
}

// Structs with dedicated array buffers (whether opaque or
// transparent) will probably be too expensive for the polyfill
// anyway, but if we do support them it's wrong to create all the view
// types for the _mem object eagerly.  Instead, the _mem object could
// be populated with the types that are needed by the initial type -
// usually just one or two - and expanded if/when other types are
// mapped onto the same memory.
//
// Optimization: If only one view type is needed then the object could
// reference that directly instead of going via the _mem object.

const _toView = function(align, constructor) {
    return function (buffer, offset_) {
	let mem = (buffer._mem ?
		   buffer._mem :
		   (buffer._mem = { int8: new Int8Array(buffer, 0, buffer.byteLength),
				    uint8: new Uint8Array(buffer, 0, buffer.byteLength),
				    int16: new Int16Array(buffer, 0, Math.floor(buffer.byteLength/2)),
				    uint16: new Uint16Array(buffer, 0, Math.floor(buffer.byteLength/2)),
				    int32: new Int32Array(buffer, 0, Math.floor(buffer.byteLength/4)),
				    uint32: new Uint32Array(buffer, 0, Math.floor(buffer.byteLength/4)),
				    float32: new Float32Array(buffer, 0, Math.floor(buffer.byteLength/4)),
				    float64: new Float64Array(buffer, 0, Math.floor(buffer.byteLength/8)) }));
	let offset = offset_|0;
	if (offset !== offset_ || (offset & (align-1)))
	    throw new Error("Invalid offset for type: " + offset_);
	return new constructor(_cookie, mem, offset);
    }
}

const _toViewIllegal = function() {
    return function (buffer, offset) {
	throw new Error("Can only view transparent types");
    }
}

// Using new Function here to avoid closing over anything and to
// provide maximum precision for type analysis.  It would be good to
// back the strategy up with numbers; obviously we end up with more
// function bodies this way.
//
// Optimization: If the optimizer can support it we could just store
// the buffer on the TO instance and create a throwaway view here.
// That's what a native implementation would effectively do.

const _getterSetter = function(type, offs) {
    let shift = [0, 1, 0, 2, 0, 0, 0, 3][type.size-1];
    let ta = type.typeName;
    return { get: new Function("", `return this._mem.${ta}[(this._offset + ${offs})>>${shift}]`),
	     set: new Function("v", `this._mem.${ta}[(this._offset + ${offs})>>${shift}] = v`) };
}

// Note, fieldOffs and this._offset are both trusted so no alignment
// check is required.
//
// TODO: For type analysis it might be best to construct this function
// at run-time as well?

const _getterStruct = function(type, fieldOffs) {
    return function () { return new type(_cookie, this._mem, this._offset + fieldOffs) }
}

const _setterStruct = function(type, fieldOffs) {
    // TODO: implement this.
    // For each field in the type that is also in v, copy the value
    // from v into this object.
    return function (v) { throw new Error("Unimplemented") }
}

const _numberType = function(name, tag, size, convert) {
    convert.typeName = name;
    convert.tag = tag;
    convert.size = size;
    convert.align = size;
    convert.view = function () { throw new Error("Can't view a primitive type"); } // Why not?
    return convert;
}

const _invalType = function(name, tag, size) {
    function convert(v) {
	throw new Error("Invalid type: " + name);
    }
    convert.typeName = name;
    convert.tag = tag;
    convert.size = size;
    convert.align = 1;
    convert.view = function () { throw new Error("Can't view an invalid type"); }
    return convert;
}

var TypedObject =
{
    StructType: function(a1, a2, a3) {
	if (typeof a2 == "number")
	    return _structArrayType(a1, a2, a3);
	return _structType(a1, a2);
    },

    int8:    _numberType("int8",    _TO_INT8,    1, (v) => (v<<24)>>24),
    uint8:   _numberType("uint8",   _TO_UINT8,   1, (v) => (v<<24)>>>24),
    int16:   _numberType("int16",   _TO_INT16,   2, (v) => (v<<16)>>16),
    uint16:  _numberType("uint16",  _TO_UINT16,  2, (v) => (v<<16)>>>16),
    int32:   _numberType("int32",   _TO_INT32,   4, (v) => v|0),
    uint32:  _numberType("uint32",  _TO_UINT32,  4, (v) => v>>>0),
    float32: _numberType("float32", _TO_FLOAT32, 4, Math.fround),
    float64: _numberType("float64", _TO_FLOAT64, 8, (v) => +v),
    any:     _invalType("any",      _TO_ANY,     4),
    string:  _invalType("string",   _TO_STRING,  4),
    object:  _invalType("object",   _TO_OBJECT,  4),

    buffer:  function (to) { return to._mem.int8.buffer; },
    offset:  function (to) { return to._offset + to._mem.int8.byteOffset; },
    length:  function (to) { return to._length; }
};

