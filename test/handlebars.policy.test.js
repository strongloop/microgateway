// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

'use strict';
var handlebarsPolicy = require('../policies/handlebars')();
var should = require('should');
var bunyan = require('bunyan');
var flowEngine = require('flow-engine');

describe('handlebars policy', function() {

    it('should be able to read a property in the context', function(done) {
        var context = flowEngine.createContext();
        context.set("request.uri", "http://localhost/foo");
        var source = '{ "uri": "{{request.uri}}" }';
        var expected = '{ "uri": "http://localhost/foo" }';
        var flow = {
        proceed: function() {
          should(context.get("message.body"))
            .exactly(expected)
            .and.be.a.String();
          done();
        },
        fail: function(error) { throw new Error('failed:' + error); },
        logger: bunyan.createLogger({
            name: 'flow-engine',
            stream: process.stdout,
            level: 'debug' }) };
        handlebarsPolicy({ source: source }, context, flow);
    });

    it('should be able to iterate over an array in the context', function(done) {
        var context = flowEngine.createContext();
        context.set("words", ["Chris", "woz", "ere"]);
        var source = '{{#each words}}{{this}} {{/each}}';
        var expected = 'Chris woz ere ';
        var flow = {
        proceed: function() {
          should(context.get("message.body"))
            .exactly(expected)
            .and.be.a.String();
          done();
        },
        fail: function(error) { throw new Error('failed:' + error); },
        logger: bunyan.createLogger({
            name: 'flow-engine',
            stream: process.stdout,
            level: 'debug' }) };
        handlebarsPolicy({ source: source }, context, flow);
    });

    it('should throw a handlebars error if source is missing', function(done) {
        var context = flowEngine.createContext();
        var flow = {
        proceed: function() {
          throw new Error('failed: expected a HandlebarsError');
        },
        fail: function(error) {
          should(error.name)
            .exactly("HandlebarsError")
            .and.be.a.String();
          should(error.value)
            .exactly("Missing Handlebars template")
            .and.be.a.String();
          done();
        },
        logger: bunyan.createLogger({
            name: 'flow-engine',
            stream: process.stdout,
            level: 'debug' }) };
        handlebarsPolicy({}, context, flow);
    });

    it('should throw a handlebars error if source is invalid', function(done) {
        var context = flowEngine.createContext();
        var source = '{{}';
        var flow = {
        proceed: function() {
          throw new Error('failed: expected a HandlebarsError');
        },
        fail: function(error) {
          should(error.name)
            .exactly("HandlebarsError")
            .and.be.a.String();
          should(error.value)
            .exactly("Invalid Handlebars template")
            .and.be.a.String();
          done();
        },
        logger: bunyan.createLogger({
            name: 'flow-engine',
            stream: process.stdout,
            level: 'debug' }) };
        handlebarsPolicy({ source: source }, context, flow);
    });

    it('should throw a handlebars error if output is invalid', function(done) {
        var context = flowEngine.createContext();
        var source = '{{this}}';
        var output = {};
        var flow = {
        proceed: function() {
          throw new Error('failed: expected a HandlebarsError');
        },
        fail: function(error) {
          should(error.name)
            .exactly("HandlebarsError")
            .and.be.a.String();
          should(error.value)
            .exactly("Invalid output")
            .and.be.a.String();
          done();
        },
        logger: bunyan.createLogger({
            name: 'flow-engine',
            stream: process.stdout,
            level: 'debug' }) };
        handlebarsPolicy({ source: source, output: output }, context, flow);
    });
    
});
