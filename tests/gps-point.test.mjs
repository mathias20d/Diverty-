import test from 'node:test';
import assert from 'node:assert/strict';
import {gpsPointFromText, reservationGpsPoint, validGpsPoint} from '../assets/js/diverty-gps-point.mjs';

test('Maps place pin coordinates take priority over its shifted camera center',()=>{
 const url='https://www.google.com/maps/place/PH+Prueba/@9.01295,-79.50180,19z/data=!4m6!3m5!1sabc!8m2!3d9.01234567!4d-79.50123456!16sxyz';
 assert.deepEqual(gpsPointFromText(url),{lat:9.01234567,lng:-79.50123456});
 assert.deepEqual(gpsPointFromText(encodeURI(url)),{lat:9.01234567,lng:-79.50123456});
});
test('saved numeric points and supported Maps/Waze links retain their precision',()=>{
 const point={lat:9.01234567,lng:-79.50123456};
 for(const value of ['9.01234567,-79.50123456','GPS: 9.01234567,-79.50123456','https://maps.google.com/?q=9.01234567%2C-79.50123456','https://www.waze.com/ul?ll=9.01234567,-79.50123456','https://google.com/maps/dir/?api=1&destination=9.01234567,-79.50123456','https://google.com/maps/@9.01234567,-79.50123456,19z'])assert.deepEqual(gpsPointFromText(value),point);
 assert.deepEqual(reservationGpsPoint({...point,direccion:'https://google.com/maps?q=9.1,-79.4'}),point);
 assert.deepEqual(reservationGpsPoint({direccion:'https://google.com/maps?q=9.01234567,-79.50123456'}),point);
 assert.deepEqual(gpsPointFromText('ll.9.1,-79.4'),{lat:9.1,lng:-79.4});
});
test('empty, out-of-range, short links and street descriptions cannot invent a GPS point',()=>{
 for(const value of ['',null,'https://maps.app.goo.gl/example','PH de prueba','99.0,-79.5','9.0,-181.1','1009.01234567,-79.50123456'])assert.equal(gpsPointFromText(value),null);
 assert.equal(validGpsPoint(null,null),null);assert.equal(validGpsPoint(' ',' '),null);assert.equal(validGpsPoint(0,0),null);
});
