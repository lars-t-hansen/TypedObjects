// TypedObject polyfill (partial but growing).
//
// Things that have not been implemented because they are expensive:
//
//  - Proper range checking on access: All getters and setters should
//    throw on OOB, I think.  Now, we just read undefined values, as
//    for TypedArray accesses.  The cost of range checking should
//    be measured, though.
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

const INT8 = 0;
const UINT8 = 1;
const INT16 = 2;
const UINT16 = 3;
const INT32 = 4;
const UINT32 = 5;
const FLOAT32 = 6;
const FLOAT64 = 7;
const STRUCT = 8;
const ANY = 9;	                // Not supported - transparent objs only, see later
const OBJECT = 10;		// Not supported - transparent objs only, see later
const STRING = 11;		// Not supported - transparent objs only, see later

const _cookie = {};

const _shiftForSize = [0, 0, 1, 0, 2, 0, 0, 0, 3];

const _structArrayType = function(type, numElems, options) {
    if (options === null || options === undefined)
	options = {};

    // TODO: implement this
    throw new Error("struct arrays not supported yet");
}

// TODO: It's possible "any", "object", and "string" in opaque objects
// could be supported as follows.  Every instance of an opaque object
// contains a private array that maps integers to object values.  When
// an object is stored in a TO ref field it is stored in the shadow
// array and the index is stored in the TO ref field (actually the
// index is constant and can be stored just once); when it is read
// from the TO ref field the index is used to look it up in the shadow
// array.  The scheme allows for subobjects too, sharing that array.
// The scheme is fairly expensive but has no GC issues and the shadow
// array is only as costly as the number of ref fields.  Normally the
// shadow array would not be created at all.
//
// An additional optimization is that when there are no sub-types
// containing refs, the refs can be stored by name on the object
// itself.

const _structType = function(fields, options) {
    if (options === null || options === undefined)
	options = {};

    if (options.defaults) {
	// TODO: Also see _setterStruct.  Defaults are not needed
	// for Type.view() or struct assignment, only for construction.
	throw new Error("Defaults not supported yet");
    }

    let proto = {};
    let desc = [];
    let offs = 0;
    let align = 1;
    for ( let name in fields ) {
	if (!fields.hasOwnProperty(name))
	    continue;
	// TODO: throw, if this is the name of an indexed property
	let type = fields[name];
	let prop = null;
	offs = (offs + (type.align - 1)) & ~(type.align - 1);
	switch (type.tag) {
	case INT8:
	case UINT8:
	case INT16:
	case UINT16:
	case INT32:
	case UINT32:
	case FLOAT32:
	case FLOAT64:
	    prop = _getterSetter(type, offs);
	    break;
	case STRUCT:
	    prop = { get: _getterStruct(type, offs), set: _setterStruct(type, offs) };
	    break;
	case ANY:
	case OBJECT:
	case STRING:
	    throw new Error("Opaque type not supported: " + type.toSource());
	default:
	    throw new Error("Unknown field type: " + type.toSource());
	}
	desc.push({name:name, offset: offs, type: type});
	Object.defineProperty(proto, name, prop);
	align = Math.max(align, type.align);
	offs += type.size;
    }

    // Rounding the size to the alignment makes arrays of objects simple
    offs = (offs + (align - 1)) & ~(align - 1);

    // TODO: hide _length on the prototype
    let constructor = _toConstructor();
    proto._length = offs;
    constructor.prototype = proto;

    // TODO: Hide these properties (also inside _numberType and _invalType)
    constructor.view = options.transparent ? _toView(align, constructor) : _toViewIllegal();
    constructor.tag = STRUCT;
    constructor.typeName = "structure";
    constructor.size = offs;
    constructor.align = align;
    constructor.desc = desc;

    return constructor;
}

// Optimization: freeze whatever fields can be frozen.

const _toConstructor = function() {
    return function (v1, v2, v3) {
	// TODO: Hide _mem and _offset behind symbols
	// TODO: Object should be frozen at construction (no expandos on TypedObjects)
	if (v1 === _cookie) {
	    this._mem = v2;
	    this._offset = v3;
	}
	else {
	    // TODO: implement this, then expose the buffer.
	    // See _setterStruct, but with defaults (simple generalization).
	    // The buffer will be new so no need to clear it.
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
// reference that directly instead of going via the _mem object, and
// the object offset could be pre-shifted, and the constant index in
// the accessor methods could be pre-shifted too.
//
// Optimization: freeze whatever fields can be frozen.

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
// Optimization: If the JIT can handle it we could just store
// the buffer on the TO instance and create a throwaway view here.
// That's what a native implementation would effectively do.

const _getterSetter = function(type, offs) {
    let shift = _shiftForSize[type.size];
    let ta = type.typeName;
    return { get: new Function("", `return this._mem.${ta}[(this._offset + ${offs})>>${shift}]`),
	     set: new Function("v", `this._mem.${ta}[(this._offset + ${offs})>>${shift}] = v`) };
}

// Optimization: For type analysis it might be best to construct this
// function at run-time as well?

const _getterStruct = function(type, fieldOffs) {
    // fieldOffs and this._offset are trusted, no alignment check required
    return function () {
	return new type(_cookie, this._mem, this._offset + fieldOffs);
    }
}

// TODO: Does this need to clear un-assigned fields?

const _setterStruct = function(type, fieldOffs) {
    let code = [];

    function traverseStruct(type, src, offs) {
	for ( let d of type.desc ) {
	    switch (d.type.tag) {
	    case INT8:
	    case UINT8:
	    case INT16:
	    case UINT16:
	    case INT32:
	    case UINT32:
	    case FLOAT32:
	    case FLOAT64: {
		let typename = d.type.typeName;
		let shift = _shiftForSize[d.type.size];
		code.push(`if ('${d.name}' in ${src}) { this._mem.${typename}[(this._offset + ${offs + d.offset}) >> ${shift}] = ${src}.${d.name} }`);
		break;
	    }
	    case STRUCT:
		traverseStruct(d.type, src + "v", offs + d.offset);
		break;
	    case ANY:
	    case OBJECT:
	    case STRING:
		throw new Error("Ref fields not supported yet");
	    default:
		throw new Error("Bad field type: " + d.tag);
	    }
	}
    }

    traverseStruct(type, "v", fieldOffs);

    return new Function("v", code.join("\n"));
}

const _numberType = function(name, tag, size, convert) {
    convert.typeName = name;
    convert.tag = tag;
    convert.size = size;
    convert.align = size;
    convert.view = function () { throw new Error("Can't view a primitive type"); } // Why not?
    convert.desc = null;
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
    convert.desc = null;
    return convert;
}

var TypedObject =
{
    StructType: function(a1, a2, a3) {
	if (typeof a2 == "number")
	    return _structArrayType(a1, a2, a3);
	return _structType(a1, a2);
    },

    int8:    _numberType("int8",    INT8,    1, (v) => (v<<24)>>24),
    uint8:   _numberType("uint8",   UINT8,   1, (v) => (v<<24)>>>24),
    int16:   _numberType("int16",   INT16,   2, (v) => (v<<16)>>16),
    uint16:  _numberType("uint16",  UINT16,  2, (v) => (v<<16)>>>16),
    int32:   _numberType("int32",   INT32,   4, (v) => v|0),
    uint32:  _numberType("uint32",  UINT32,  4, (v) => v>>>0),
    float32: _numberType("float32", FLOAT32, 4, Math.fround),
    float64: _numberType("float64", FLOAT64, 8, (v) => +v),
    any:     _invalType("any",      ANY,     4),
    string:  _invalType("string",   STRING,  4),
    object:  _invalType("object",   OBJECT,  4),

    buffer:  function (to) { return to._mem.int8.buffer; },
    offset:  function (to) { return to._offset + to._mem.int8.byteOffset; },
    length:  function (to) { return to._length; }
};

