'use strict';

const fs        = require('fs');
const express   = require('express');
const supertest = require('supertest');
const echo      = require('./support/echo-server');
const policyLoader  = require('../lib/policy-loader');
const should        = require('should');
const path          = require('path');

describe('policy-loader', function() {
    describe('load default policy', function() {
        it('should contains cors, invoke, redaction set-variable', function() {
            let pl = policyLoader.create(path.resolve(__dirname, '..', 'policies'));
            pl.should.be.a.Object();
            let policies = pl.getPolicies();
            policies.should.have.property('cors');
            policies.should.have.property('invoke');
            policies.should.have.property('set-variable');
            policies['cors'].should.be.a.Function();
            policies['invoke'].should.be.a.Function();
            policies['set-variable'].should.be.a.Function();
        });
    });
    describe('multiple locations', function() {
        it('should load policies in location1 and location2', function() {
            let paths = [
                path.resolve(__dirname, 'definitions',
                        'policy-loader', 'location1'),
                path.resolve(__dirname, 'definitions',
                        'policy-loader', 'location2')
            ];
            let pl = policyLoader.create(paths, {
                'mypolicy1': {
                    'settings': {
                        'foo': 'bar2'
                    }
                }});
            pl.should.be.a.Object();
            let policies = pl.getPolicies();
            policies.should.have.property('mypolicy1');
            policies.should.have.property('mypolicy2');
            policies.should.have.property('mypolicy3');
            policies.should.have.property('mypolicy4');
            policies['mypolicy1'].should.be.a.Function();
            policies['mypolicy2'].should.be.a.Function();
            policies['mypolicy3'].should.be.a.Function();
            policies['mypolicy4'].should.be.a.Function();
            let context = {};
            function next() {};
            policies.mypolicy1({}, context, next);
            //the second mypolicy1 override the first one
            context.policyName.should.exactly('mypolicy1a').and.be.a.String();
            policies.mypolicy2({}, context, next);
            context.policyName.should.exactly('mypolicy2').and.be.a.String();
            policies.mypolicy3({}, context, next);
            context.policyName.should.exactly('mypolicy3').and.be.a.String();
            policies.mypolicy4({}, context, next);
            context.policyName.should.exactly('mypolicy4').and.be.a.String();
        });
    });
    describe('error cases', function() {
        it('should throw error if not abs path', function() {
            should.throws(function() {
                policyLoader.create(path.resolve('..', 'policies'));
            });
        });
        it('should throw error if path is incorrect', function() {
            should.throws(function() {
                policyLoader.create(path.resolve(__dirname, 'policies'));
            });
        });
    });

//    describe('use CONFIG_DIR to load policies', function() {
//        let request;
//        before((done) => {
//          process.env.CONFIG_DIR = __dirname + '/definitions/policy-loader';
//          done();
//        });
//
//        after((done) => {
//          delete process.env.CONFIG_DIR;
//          done();
//        });
//
//        it('should load multiple locations in policy-locations.json correctly', function(done) {
//            const mg = require('../lib/microgw');
//            mg.start(3000).then( () => {
//                mg.stop().then( () => {
//                    done();
//                });
//            }).catch(done);
//        });
//      });
});

