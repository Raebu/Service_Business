import test from 'node:test';
import assert from 'node:assert/strict';
import {notificationDeliveryKey} from './notifications';

test('the same queued message gets the same idempotency key across retries',()=>{
 const id='eb547a23-1db5-4b23-a7df-548a58a3826a';
 assert.equal(notificationDeliveryKey(id),notificationDeliveryKey(id));
 assert.notEqual(notificationDeliveryKey(id),
   notificationDeliveryKey('ed547a23-1db5-4b23-a7df-548a58a3826b'));
});
test('invalid or injected notification identifiers are rejected',()=>{
 assert.throws(()=>notificationDeliveryKey('a'));
 assert.throws(()=>notificationDeliveryKey('valid-id\r\nX-Other:1'));
});
