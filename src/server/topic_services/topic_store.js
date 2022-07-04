/* Copyright (C) 2022 NooBaa */
'use strict';

const db_client = require('../../util/db_client');

const topic_schema = require('./topic_schema');
const topic_indexes = require('./topic_indexes');

class TopicStore {

    constructor() {
        this._topics = db_client.instance().define_collection({
            name: 'topics',
            schema: topic_schema,
            db_indexes: topic_indexes,
        });
    }

    static instance() {
        if (!TopicStore._instance) TopicStore._instance = new TopicStore();
        return TopicStore._instance;
    }

    async create_topic(topic) {
        try {
            this._topics.validate(topic);
            await this._topics.insertOne(topic);
        } catch (err) {
            db_client.instance().check_duplicate_key_conflict(err, 'topic');
        }
        return topic;
    }

    // TODO: need deleted ?
    async delete_topic(topic_id) {
        await this._topics.updateOne({
            _id: topic_id,
        }, {
            $set: {
                deleted: new Date()
            }
        });
    }

    async read_topic(topic_id) {
        const res = await this._topics.findOne({
            _id: topic_id,
            deleted: null,
        });
        return db_client.instance().check_entity_not_deleted(res, 'topic');
    }
}

TopicStore._instance = undefined;

// EXPORTS
exports.TopicStore = TopicStore;
exports.instance = TopicStore.instance;
