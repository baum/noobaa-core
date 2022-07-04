/* Copyright (C) 2022 NooBaa */
'use strict';

module.exports = {
    $id: 'topic_schema',
    type: 'object',
    required: [
        '_id',
        'type',
        'target',
    ],
    properties: {
        _id: {
            objectid: true
        },
        deleted: {
            date: true
        },
        type: {
            type: 'string'
        },
        target: {
            type: 'string'
        },
    }
};
