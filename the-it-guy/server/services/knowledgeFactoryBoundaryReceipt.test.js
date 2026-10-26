import {test} from 'node:test';
import assert from 'node:assert/strict';
import {boundaryFromWkt,verifiedBoundaryGeometry} from '../../src/services/propertyIntelligence/knowledgeFactoryBoundary.js';
import {issueBoundaryReceipt,verifyBoundaryReceipt} from './knowledgeFactoryBoundaryReceipt.js';
const geometry=boundaryFromWkt('POLYGON ((28 -25,28.001 -25,28.001 -25.001,28 -25.001,28 -25))');
const input={geometry,organisationId:'org',actorId:'actor',propertyId:'123',environment:'uat',key:'local-private-test',now:1000000000000};
const receipt=issueBoundaryReceipt(input);
test('preserves holes and multiple islands, rejects projection, dimensions and invalid outlines',()=>{
 const multi=boundaryFromWkt('MULTIPOLYGON (((0 0,1 0,1 1,0 1,0 0),(0.2 0.2,0.4 0.2,0.4 0.4,0.2 0.2)),((2 2,3 2,3 3,2 2)))');
 assert.equal(multi.coordinates.length,2);assert.equal(multi.coordinates[0].length,2);
 for(const wkt of ['POINT (28 -25)','SRID=3857;POLYGON ((0 0,1 0,1 1,0 0))','POLYGON Z ((0 0 1,1 0 1,1 1 1,0 0 1))','POLYGON ((0 0,1 1,2 2,0 0))','POLYGON ((0 0,1 0,1 1))','POLYGON ((999 0,1 0,1 1,999 0))'])assert.equal(boundaryFromWkt(wkt),null,wkt);
 assert.equal(verifiedBoundaryGeometry({type:'MultiPolygon',coordinates:[[[[NaN,0],[1,0],[1,1],[NaN,0]]]]}),null);
});
test('server receipt authenticates exact actor, organisation, property, freshness and geometry',()=>{
 const verified=verifyBoundaryReceipt({...input,receipt});assert.equal(verified.status,'supplied');assert.deepEqual(verified.geometry,geometry);
 for(const patch of [{receipt:receipt+'x'},{organisationId:'other'},{actorId:'other'},{propertyId:'124'},{key:'other'},{now:input.now+7200001}])assert.throws(()=>verifyBoundaryReceipt({...input,receipt,...patch}));
 assert.equal(verifyBoundaryReceipt({...input,receipt,environment:'live'}).status,'unavailable');
 assert.equal(issueBoundaryReceipt({...input,geometry:null}),null);assert.equal(verifyBoundaryReceipt({...input,receipt:null}),null);
});

test('omits oversized geometry whole rather than inflating the map response or trimming rings',()=>{
 const ring=Array.from({length:3000},(_,i)=>[28+Math.cos(i/3000*2*Math.PI)*.1,-25+Math.sin(i/3000*2*Math.PI)*.1]);ring.push(ring[0]);
 const large={type:'MultiPolygon',coordinates:[[ring]]};assert.ok(verifiedBoundaryGeometry(large));assert.equal(issueBoundaryReceipt({...input,geometry:large}),null);
});
