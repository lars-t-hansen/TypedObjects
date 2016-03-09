load("to.js");

assertEq(this._cookie, undefined); // Internals not visible

var T = TypedObject;

var Point = T.StructType({x:T.int32, y:T.int32}, {transparent:true});

assertEq(Point.size, 8);
assertEq(Point.align, 4);

var ab = new ArrayBuffer(128);
var ia = new Int32Array(ab);
ia[8] = 37;
ia[9] = 42;

var pt = Point.view(ab, 32);

assertEq(pt.x, 37);
assertEq(pt.y, 42);

pt.x = 13;
pt.y = 88;

assertEq(ia[8], 13);
assertEq(ia[9], 88);

assertEq(T.buffer(pt), ab);
assertEq(T.offset(pt), 32);
assertEq(T.length(pt), 8);

var Rect = T.StructType({ul:Point, lr:Point}, {transparent:true});

ia[10] = 7;
ia[11] = 98;

var rect = Rect.view(ab, 32);

assertEq(rect.ul.x, 13);
assertEq(rect.ul.y, 88);
assertEq(rect.lr.x, 7);
assertEq(rect.lr.y, 98);

rect.lr.x = 15;

assertEq(ia[10], 15);

assertEq(T.buffer(rect), ab);
assertEq(T.offset(rect), 32);
assertEq(T.length(rect), 16);

assertEq(T.buffer(rect.lr), ab);
assertEq(T.offset(rect.lr), 40);
assertEq(T.length(rect.lr), 8);

assertEq(T.int8(-256), 0);
assertEq(T.int8(-257), -1);
