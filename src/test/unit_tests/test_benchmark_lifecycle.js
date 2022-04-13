/* Copyright (C) 2022 NooBaa */
/* eslint-disable no-invalid-this */

'use strict';

const AWS = require('aws-sdk');
const P = require('../../util/promise');
const http_utils = require('../../util/http_utils');
// @ts-ignore
const mocha = require('mocha');
// @ts-ignore
const { v4: uuid } = require('uuid');
const assert = require('assert');
const util = require('util');
const lifecycle = require('../../server/bg_services/lifecycle');
const MDStore = require('../../server/object_services/md_store').MDStore;
const mongodb = require('mongodb');

const commonTests = require('../lifecycle/common');
const coretest = require('./coretest');
const { rpc_client, EMAIL } = coretest;
const Bucket = 'first.bucket';
// @ts-ignore
const Key = `test-get-lifecycle-object-${Date.now()}`;
// @ts-ignore
const TagName = 'tagname';
// @ts-ignore
const TagName2 = 'tagname2';
// @ts-ignore
const TagValue = 'tagvalue';
// @ts-ignore
const TagValue2 = 'tagvalue2';

mocha.describe('lifecycle', () => {

    let s3;
    mocha.before(async function() {
        this.timeout(60000);

        const account_info = await rpc_client.account.read_account({ email: EMAIL, });
        s3 = new AWS.S3({
            endpoint: coretest.get_http_address(),
            accessKeyId: account_info.access_keys[0].access_key.unwrap(),
            secretAccessKey: account_info.access_keys[0].secret_key.unwrap(),
            s3ForcePathStyle: true,
            signatureVersion: 'v4',
            computeChecksums: true,
            s3DisableBodySigning: false,
            region: 'us-east-1',
            // @ts-ignore
            httpOptions: { agent: http_utils.get_unsecured_agent(coretest.get_http_address()) },
        });
        coretest.log('S3 CONFIG', s3.config);
    });

    mocha.describe('bucket-lifecycle-benchmark', function() {
        this.timeout(24 * 60 * 60 * 1000);

        async function create_mock_object(key, bucket, age, size, tagging) {
            const content_type = 'application/octet-stream';
            console.log('create_object_upload bucket', bucket, 'key', key, 'content-type', content_type);
            const { obj_id } = await rpc_client.object.create_object_upload({ bucket, key, content_type });
            console.log('create_object_upload obj_id', obj_id);
            const completeUploadResult = await rpc_client.object.complete_object_upload({ obj_id, bucket, key });
            console.log('completeUploadResult', completeUploadResult);

            // go back in time
            let create_time = new Date();
            create_time.setDate(create_time.getDate() - age);
            const update = {
                create_time,
            };
            if (size) update.size = size;
            if (tagging) update.tagging = tagging;

            console.log('create_mock_object bucket', bucket, 'key', key, 'update', util.inspect(update));
            const id = new mongodb.ObjectId(obj_id);
            console.log('create_mock_object id', id, 'obj_id', obj_id);

            const updateResult = await MDStore.instance().update_object_by_id(id, update);
            console.log('update_object_by_id', updateResult);

            const object_md = await rpc_client.object.read_object_md({ bucket, key, adminfo: {} });
            console.log('read_object_md object_md', object_md);
            const actual_create_time = object_md.create_time;
            const actual_size = object_md.size;
            const actual_tags = object_md.tagging;
            assert.strictEqual(actual_create_time, create_time.getTime(), `object create_time/getTime actual ${actual_create_time} !== expected ${create_time.getTime()}`);
            assert((size === undefined) || (size === actual_size), `object size actual ${actual_size} !== expected ${size}`);
            assert((tagging === undefined) || (JSON.stringify(actual_tags) === JSON.stringify(tagging)), `object tags actual ${util.inspect(actual_tags)} !== expected ${util.inspect(tagging)}`);
        }

        // @ts-ignore
        async function verify_object_deleted(key) {
            await P.delay(100); // 0.1sec
            await rpc_client.system.read_system();
            /* read_activity_log fails w/postgres
               see https://github.com/noobaa/noobaa-core/runs/5750698669
            */
            if (process.env.DB_TYPE !== 'postgres') {
                const eventLogs = await rpc_client.events.read_activity_log({limit: 32});
                console.log('read_activity_log logs: ', util.inspect(eventLogs));
                const found = eventLogs.logs.find(e => (e.event === 'obj.deleted') && (e.obj.key === key));
                console.log('read_activity_log found log: ', found);
                assert(found && found.obj.key === key, `find deleted actual ${util.inspect(found)} expected ${key}`);
            }
            const listObjectResult = await rpc_client.object.list_objects_admin({ bucket: Bucket, prefix: key });
            console.log('list_objects_admin objects: ', util.inspect(listObjectResult.objects));
            const actualLength = listObjectResult.objects.length;
            assert.strictEqual(actualLength, 0, `listObjectResult actual ${actualLength} !== expected 0`);
        }
        mocha.it('benchmark size expiration', async () => {
            const bucket = Bucket;
            const test_size = 1000 * 1000 * 1000; //100000;
            const startCreate = new Date();
            for (let i = 0; i < test_size; i++) {
                const key = uuid();
                const age = (test_size * 2) - i;
                await create_mock_object(key, bucket, age);
                const remainder = i % 10;
                if (remainder === 0) {
                    console.log('Created', i, 'mock objects....');
                }
            }
            const endCreate = new Date();
            // @ts-ignore
            const creationDiff = endCreate - startCreate;
            console.log("Created", test_size, 'mock objects in ', creationDiff, 'ms');

            const listObjectCreatedResult = await rpc_client.object.list_objects_admin({ bucket: Bucket });
            console.log('list_objects_admin objects: ', util.inspect(listObjectCreatedResult.objects));
            const actualCreatedLength = listObjectCreatedResult.objects.length;
            console.log("list_objects_admin", actualCreatedLength, 'mock objects');
            assert(test_size === actualCreatedLength, `Created objects actual ${actualCreatedLength} != expected ${test_size}`);

            const half_test_size = Math.floor(test_size / 2);
            const putLifecycleParams = commonTests.size_gt_lt_lifecycle_configuration(bucket, half_test_size, half_test_size + test_size);
            await s3.putBucketLifecycleConfiguration(putLifecycleParams).promise();
            const startExpire = new Date();
            await lifecycle.background_worker();
            const endExpire = new Date();
            // @ts-ignore
            const expireDiff = endExpire - startExpire;
            console.log("Expired", half_test_size, 'mock objects in ', expireDiff, 'ms');

            const listObjectExpiresResult = await rpc_client.object.list_objects_admin({ bucket: Bucket });
            console.log('list_objects_admin objects: ', util.inspect(listObjectCreatedResult.objects));
            const actualExpiredLength = listObjectExpiresResult.objects.length;
            console.log("list_objects_admin", actualExpiredLength, 'mock objects');
            assert(test_size === actualExpiredLength, `Created objects actual ${actualExpiredLength} != expected ${test_size}`);

        });

        console.log('✅ The lifecycle benchmark test was completed successfully');
    });
});
