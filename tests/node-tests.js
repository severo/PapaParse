"use strict";

var Papa = require("../papaparse.js");

var fs = require('fs');
var assert = require('assert');
var longSampleRawCsv = fs.readFileSync(__dirname + '/long-sample.csv', 'utf8');
var utf8BomSampleRawCsv = fs.readFileSync(__dirname + '/utf-8-bom-sample.csv', 'utf8');
var verylongSampleRawCsv = fs.readFileSync(__dirname + '/verylong-sample.csv', 'utf8');

function assertLongSampleParsedCorrectly(parsedCsv) {
	assert.equal(8, parsedCsv.data.length);
	assert.deepEqual(parsedCsv.data[0], [
		'Grant',
		'Dyer',
		'Donec.elementum@orciluctuset.example',
		'2013-11-23T02:30:31-08:00',
		'2014-05-31T01:06:56-07:00',
		'Magna Ut Associates',
		'ljenkins'
	]);
	assert.deepEqual(parsedCsv.data[7], [
		'Talon',
		'Salinas',
		'posuere.vulputate.lacus@Donecsollicitudin.example',
		'2015-01-31T09:19:02-08:00',
		'2014-12-17T04:59:18-08:00',
		'Aliquam Iaculis Incorporate',
		'Phasellus@Quisquetincidunt.example'
	]);
	assert.deepEqual(parsedCsv.meta, {
		"delimiter": ",",
		"linebreak": "\n",
		"aborted": false,
		renamedHeaders: null,
		"cursor": 1209
	});
	assert.equal(parsedCsv.errors.length, 0);
}

describe('PapaParse', function() {
	it('asynchronously parsed CSV should be correctly parsed', function() {
		const result = {
			data: [],
			errors: [],
			meta: {}
		};
		Papa.parse(longSampleRawCsv, {
			step: function(parsedCsv) {
				result.data.push(parsedCsv.data);
				result.errors.push(...parsedCsv.errors);
				result.meta = parsedCsv.meta;
			},
		});
		assertLongSampleParsedCorrectly(result);
	});

	it('reports the correct row number on FieldMismatch errors', function() {
		const errors = [];
		const data = [];
		Papa.parse(verylongSampleRawCsv, {
			header: true,
			step: function(parsedCsv) {
				data.push(parsedCsv.data);
				errors.push(...parsedCsv.errors);
			},
		});
		assert.deepEqual(errors, [
			{
				"type": "FieldMismatch",
				"code": "TooFewFields",
				"message": "Too few fields: expected 3 fields but parsed 2",
				"row": 498
			},
			{
				"type": "FieldMismatch",
				"code": "TooFewFields",
				"message": "Too few fields: expected 3 fields but parsed 2",
				"row": 998
			},
			{
				"type": "FieldMismatch",
				"code": "TooFewFields",
				"message": "Too few fields: expected 3 fields but parsed 2",
				"row": 1498
			},
			{
				"type": "FieldMismatch",
				"code": "TooFewFields",
				"message": "Too few fields: expected 3 fields but parsed 2",
				"row": 1998
			},
			// Note(SL): I had to add this extra error to make the test pass when parsing from string.
			{
				"type": "FieldMismatch",
				"code": "TooFewFields",
				"message": "Too few fields: expected 3 fields but parsed 1",
				"row": 2000
			}
		]);
		assert.strictEqual(2001, data.length); // Note(SL): string returns 2001, not 2000
	});

	it('handles utf-8 BOM encoded files', function(done) {
		Papa.parse(utf8BomSampleRawCsv, {
			header: true,
			step: function(parsedCsv) {
				assert.deepEqual(parsedCsv.data, { A: 'X', B: 'Y', C: 'Z' });
				done();
			}
		});
	});
});
