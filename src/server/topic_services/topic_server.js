/* Copyright (C) 2022 NooBaa */
'use strict';

const dbg = require('../../util/debug_module')(__filename);
const topic_store = require('./topic_store');

async function create_topic(req) {
    dbg.log0('create_topic:', req.params);
    const { _id: topic_id, type: topic_type, target: topic_target } = req.params;

    await topic_store.instance().create_topic({
        _id: topic_id,
        type: topic_type,
        target: topic_target,
    });
}

async function delete_topic(req) {
    dbg.log0('delete_topic:', req.params);
    const topic = await _load_topic(req);
    await topic_store.instance().delete_topic(topic._id);
}

async function read_topic(req) {
    const topic = await _load_topic(req);
    return topic;
}

async function _load_topic(req) {
    const topic_id = req.params._id;
    const topic = await topic_store.instance().read_topic(topic_id);
    req.topic = topic;
    return topic;
}

exports.create_topic = create_topic;
exports.delete_topic = delete_topic;
exports.read_topic = read_topic;
