/* @license
Papa Parse
v5.5.3
https://github.com/mholt/PapaParse
License: MIT
*/

(function(root, factory)
{
	/* globals define */
	if (typeof define === 'function' && define.amd)
	{
		// AMD. Register as an anonymous module.
		define([], factory);
	}
	else if (typeof module === 'object' && typeof exports !== 'undefined')
	{
		// Node. Does not work with strict CommonJS, but
		// only CommonJS-like environments that support module.exports,
		// like Node.
		module.exports = factory();
	}
	else
	{
		// Browser globals (root is window)
		root.Papa = factory();
	}
}(this, function()
{
	'use strict';

	var global = (function() {
		// alternative method, similar to `Function('return this')()`
		// but without using `eval` (which is disabled when
		// using Content Security Policy).

		if (typeof self !== 'undefined') { return self; }
		if (typeof window !== 'undefined') { return window; }
		if (typeof global !== 'undefined') { return global; }

		// When running tests none of the above have been defined
		return {};
	})();

	var Papa = {};

	Papa.parse = CsvToJson;

	Papa.RECORD_SEP = String.fromCharCode(30);
	Papa.UNIT_SEP = String.fromCharCode(31);
	Papa.BYTE_ORDER_MARK = '\ufeff';
	Papa.BAD_DELIMITERS = ['\r', '\n', '"', Papa.BYTE_ORDER_MARK];

	// Configurable chunk sizes for remote files
	Papa.RemoteChunkSize = 1024 * 1024 * 5;	// 5 MB
	Papa.DefaultDelimiter = ',';			// Used if not specified and detection fails

	// Exposed for testing and development only
	Papa.Parser = Parser;
	Papa.ParserHandle = ParserHandle;
	Papa.NetworkStreamer = NetworkStreamer;
	Papa.StringStreamer = StringStreamer;

	// Strip character from UTF-8 BOM encoded files that cause issue parsing the file
	// Note(SL): take the BOM into account when calculating byte offsets (see the ignoreBOM TextDecoder option too)
	function stripBom(string) {
		if (string.charCodeAt(0) === 0xfeff) {
			return string.slice(1);
		}
		return string;
	}

	function CsvToJson(_input, _config)
	{
		_config = _config || {};

		var streamer = null;

		if (typeof _input !== 'string') {
			throw new Error('Input must be a string');
		}
		if (!isFunction(_config.step)) {
			throw new Error('Step function required for async parsing.');
		}

		if (_config.download)
			streamer = new NetworkStreamer(_config);
		else
			streamer = new StringStreamer(_config);

		return streamer.stream(_input);
	}


	/** ChunkStreamer is the base prototype for various streamer implementations. */
	function ChunkStreamer(config)
	{
		this._handle = null;
		this._finished = false;
		this._completed = false;
		this._halted = false;
		this._input = null;
		this._baseIndex = 0;
		this._partialLine = '';
		this._nextChunk = null;
		this._offset = 0; // The byte offset where parsing started
		replaceConfig.call(this, config);

		this.parseChunk = function(chunk)
		{
			this._halted = false;

			// Rejoin the line we likely just split in two by chunking the file
			var aggregate = this._partialLine + chunk;
			this._partialLine = '';
			var results = this._handle.parse(aggregate, this._baseIndex, !this._finished);

			if (this._handle.aborted()) {
				this._halted = true;
				return;
			}

			var lastIndex = results.meta.cursor;

			if (!this._finished)
			{
				this._partialLine = aggregate.substring(lastIndex - this._baseIndex);
				this._baseIndex = lastIndex;
			}

			var finished = this._finished;

			if (!this._completed && finished && isFunction(this._config.complete) && (!results || !results.meta.aborted)) {
				this._config.complete();
				this._completed = true;
			}

			if (!finished)
				this._nextChunk();

			return results;
		};

		this._sendError = function(error)
		{
			if (isFunction(this._config.error))
				this._config.error(error);
		};

		function replaceConfig(config)
		{
			// Deep-copy the config so we can edit it
			var configCopy = copy(config);
			configCopy.chunkSize = parseInt(configCopy.chunkSize);	// parseInt VERY important so we don't concatenate strings!
			if (!config.step)
				configCopy.chunkSize = null;  // disable Range header if not streaming; bad values break IIS - see issue #196
			this._handle = new ParserHandle(configCopy);
			this._handle.streamer = this;
			this._config = configCopy;	// persist the copy to the caller
		}
	}


	function NetworkStreamer(config)
	{
		config = config || {};
		if (!config.chunkSize)
			config.chunkSize = Papa.RemoteChunkSize;
		ChunkStreamer.call(this, config);

		var xhr;
		if (config.offset)
			this._offset = parseInt(config.offset);
		let start = this._offset;

		this._nextChunk = function()
		{
			this._readChunk();
		};

		this.stream = function(url)
		{
			this._input = stripBom(url);
			this._nextChunk();	// Starts streaming
		};

		this._readChunk = function()
		{
			if (this._finished)
			{
				this._chunkLoaded();
				return;
			}

			xhr = new XMLHttpRequest();

			if (this._config.withCredentials)
			{
				xhr.withCredentials = this._config.withCredentials;
			}

			xhr.onload = bindFunction(this._chunkLoaded, this);
			xhr.onerror = bindFunction(this._chunkError, this);

			xhr.open(this._config.downloadRequestBody ? 'POST' : 'GET', this._input, false);
			// Headers can only be set when once the request state is OPENED
			if (this._config.downloadRequestHeaders)
			{
				var headers = this._config.downloadRequestHeaders;

				for (var headerName in headers)
				{
					xhr.setRequestHeader(headerName, headers[headerName]);
				}
			}

			if (this._config.chunkSize)
			{
				var end = start + this._config.chunkSize - 1;	// minus one because byte range is inclusive
				xhr.setRequestHeader('Range', 'bytes=' + start + '-' + end);
			}

			try {
				xhr.send(this._config.downloadRequestBody);
			}
			catch (err) {
				this._chunkError(err.message);
			}
		};

		this._chunkLoaded = function()
		{
			if (xhr.readyState !== 4)
				return;

			if (xhr.status < 200 || xhr.status >= 400)
			{
				this._chunkError();
				return;
			}

			if (this._config.chunkSize) {
				start += this._config.chunkSize;
				this._finished = start >= getFileSize(xhr);
			} else {
				// if no chunkSize, no need to increment start, we are done after this
				this._finished = true;
			}
			this.parseChunk(xhr.responseText);
		};

		this._chunkError = function(errorMessage)
		{
			var errorText = xhr.statusText || errorMessage;
			this._sendError(new Error(errorText));
		};

		function getFileSize(xhr)
		{
			var contentRange = xhr.getResponseHeader('Content-Range');
			if (contentRange === null) { // no content range, then finish!
				return -1;
			}
			return parseInt(contentRange.substring(contentRange.lastIndexOf('/') + 1));
		}
	}
	NetworkStreamer.prototype = Object.create(ChunkStreamer.prototype);
	NetworkStreamer.prototype.constructor = NetworkStreamer;


	function StringStreamer(config)
	{
		config = config || {};
		ChunkStreamer.call(this, config);

		var remaining;
		this.stream = function(s)
		{
			remaining = stripBom(s);
			return this._nextChunk();
		};
		this._nextChunk = function()
		{
			if (this._finished) return;
			var size = this._config.chunkSize;
			var chunk;
			if(size) {
				chunk = remaining.substring(0, size);
				remaining = remaining.substring(size);
			} else {
				chunk = remaining;
				remaining = '';
			}
			this._finished = !remaining;
			return this.parseChunk(chunk);
		};
	}
	StringStreamer.prototype = Object.create(StringStreamer.prototype);
	StringStreamer.prototype.constructor = StringStreamer;


	// Use one ParserHandle per entire CSV file or string
	function ParserHandle(_config)
	{
		var self = this;
		var _rowCounter = 0;	// Number of rows that have been parsed so far
		var _input;				// The input being parsed
		var _parser;			// The core parser being used
		var _aborted = false;	// Whether the parser has aborted or not
		var _delimiterError;	// Temporary state between delimiter detection and processing results
		var _fields = [];		// Fields are from the header row of the input, if there is one
		var _results = {		// The last results returned from the parser
			data: [],
			errors: [],
			meta: {}
		};

		if (!isFunction(_config.step)) {
			throw new Error('Step function required for async parsing.');
		}

		var userStep = _config.step;
		_config.step = function(results)
		{
			_results = results;

			if (needsHeaderRow())
				processResults();
			else	// only call user's step function after header row
			{
				processResults();

				// It's possible that this line was empty and there's no row here after all
				if (_results.data.length === 0)
					return;

				_results.data = _results.data[0];
				userStep(_results, self);
			}
		};

		/**
		 * Parses input. Most users won't need, and shouldn't mess with, the baseIndex
		 * and ignoreLastRow parameters. They are used by streamers (wrapper functions)
		 * when an input comes in multiple chunks, like from a file.
		 */
		this.parse = function(input, baseIndex, ignoreLastRow)
		{
			var quoteChar = _config.quoteChar || '"';
			if (!_config.newline)
				_config.newline = this.guessLineEndings(input, quoteChar);

			_delimiterError = false;
			if (!_config.delimiter)
			{
				var delimGuess = guessDelimiter(input, _config.newline, _config.skipEmptyLines, _config.comments, _config.delimitersToGuess);
				if (delimGuess.successful)
					_config.delimiter = delimGuess.bestDelimiter;
				else
				{
					_delimiterError = true;	// add error after parsing (otherwise it would be overwritten)
					_config.delimiter = Papa.DefaultDelimiter;
				}
				_results.meta.delimiter = _config.delimiter;
			}
			else if(isFunction(_config.delimiter))
			{
				_config.delimiter = _config.delimiter(input);
				_results.meta.delimiter = _config.delimiter;
			}

			var parserConfig = copy(_config);

			_input = input;
			_parser = new Parser(parserConfig);
			_results = _parser.parse(_input, baseIndex, ignoreLastRow);
			processResults();
			return (_results || { meta: {} });
		};

		this.aborted = function()
		{
			return _aborted;
		};

		this.abort = function()
		{
			_aborted = true;
			_parser.abort();
			_results.meta.aborted = true;
			if (isFunction(_config.complete))
				_config.complete();
			_input = '';
		};

		this.guessLineEndings = function(input, quoteChar)
		{
			input = input.substring(0, 1024 * 1024);	// max length 1 MB
			// Replace all the text inside quotes
			var re = new RegExp(escapeRegExp(quoteChar) + '([^]*?)' + escapeRegExp(quoteChar), 'gm');
			input = input.replace(re, '');

			var r = input.split('\r');

			var n = input.split('\n');

			var nAppearsFirst = (n.length > 1 && n[0].length < r[0].length);

			if (r.length === 1 || nAppearsFirst)
				return '\n';

			var numWithN = 0;
			for (var i = 0; i < r.length; i++)
			{
				if (r[i][0] === '\n')
					numWithN++;
			}

			return numWithN >= r.length / 2 ? '\r\n' : '\r';
		};

		function testEmptyLine(s) {
			return _config.skipEmptyLines === 'greedy' ? s.join('').trim() === '' : s.length === 1 && s[0].length === 0;
		}

		function processResults()
		{
			if (_results && _delimiterError)
			{
				addError('Delimiter', 'UndetectableDelimiter', 'Unable to auto-detect delimiting character; defaulted to \'' + Papa.DefaultDelimiter + '\'');
				_delimiterError = false;
			}

			if (_config.skipEmptyLines)
			{
				_results.data = _results.data.filter(function(d) {
					return !testEmptyLine(d);
				});
			}

			if (needsHeaderRow())
				fillHeaderFields();

			return applyHeader();
		}

		function needsHeaderRow()
		{
			return _config.header && _fields.length === 0;
		}

		function fillHeaderFields()
		{
			if (!_results)
				return;

			function addHeader(header, i)
			{
				header = stripBom(header);

				_fields.push(header);
			}

			if (Array.isArray(_results.data[0]))
			{
				for (var i = 0; needsHeaderRow() && i < _results.data.length; i++)
					_results.data[i].forEach(addHeader);

				_results.data.splice(0, 1);
			}
			// if _results.data[0] is not an array, we are in a step where _results.data is the row.
			else
				_results.data.forEach(addHeader);
		}

		function applyHeader()
		{
			if (!_results || !_config.header)
				return _results;

			function processRow(rowSource, i)
			{
				var row = _config.header ? {} : [];

				var j;
				for (j = 0; j < rowSource.length; j++)
				{
					var field = j;
					var value = rowSource[j];

					if (_config.header)
						field = j >= _fields.length ? '__parsed_extra' : _fields[j];

					if (field === '__parsed_extra')
					{
						row[field] = row[field] || [];
						row[field].push(value);
					}
					else
						row[field] = value;
				}


				if (_config.header)
				{
					if (j > _fields.length)
						addError('FieldMismatch', 'TooManyFields', 'Too many fields: expected ' + _fields.length + ' fields but parsed ' + j, _rowCounter + i);
					else if (j < _fields.length)
						addError('FieldMismatch', 'TooFewFields', 'Too few fields: expected ' + _fields.length + ' fields but parsed ' + j, _rowCounter + i);
				}

				return row;
			}

			var incrementBy = 1;
			if (!_results.data.length || Array.isArray(_results.data[0]))
			{
				_results.data = _results.data.map(processRow);
				incrementBy = _results.data.length;
			}
			else
				_results.data = processRow(_results.data, 0);


			if (_config.header && _results.meta)
				_results.meta.fields = _fields;

			_rowCounter += incrementBy;
			return _results;
		}

		function guessDelimiter(input, newline, skipEmptyLines, comments, delimitersToGuess) {
			var bestDelim, bestDelta, maxFieldCount;

			delimitersToGuess = delimitersToGuess || [',', '\t', '|', ';', Papa.RECORD_SEP, Papa.UNIT_SEP];

			for (var i = 0; i < delimitersToGuess.length; i++) {
				var delim = delimitersToGuess[i];
				var delta = 0;
				let nonEmptyLinesCount = 0;
				let avgFieldCount = 0;
				let fieldCountPrevRow;
				let j = 0;
				const previewLines = 10;

				// eslint-disable-next-line prefer-const
				let parser;

				// eslint-disable-next-line no-loop-func
				const step = (results) => {
					if (j >= previewLines) {
						parser.abort();
						return;
					}
					const data = results.data[0];
					if (skipEmptyLines && testEmptyLine(data)) {
						return;
					}
					nonEmptyLinesCount++;

					var fieldCount = data.length;
					avgFieldCount += fieldCount;

					if (typeof fieldCountPrevRow === 'undefined') {
						fieldCountPrevRow = fieldCount;
						return;
					}
					else if (fieldCount > 0) {
						delta += Math.abs(fieldCount - fieldCountPrevRow);
						fieldCountPrevRow = fieldCount;
					}
					j++;
				};

				parser = new Parser({
					comments: comments,
					delimiter: delim,
					newline: newline,
					step: step
				});
				parser.parse(input);

				if (nonEmptyLinesCount > 0)
					avgFieldCount /= (nonEmptyLinesCount);

				if ((typeof bestDelta === 'undefined' || delta <= bestDelta)
					&& (typeof maxFieldCount === 'undefined' || avgFieldCount > maxFieldCount) && avgFieldCount > 1.99) {
					bestDelta = delta;
					bestDelim = delim;
					maxFieldCount = avgFieldCount;
				}
			}

			_config.delimiter = bestDelim;

			return {
				successful: !!bestDelim,
				bestDelimiter: bestDelim
			};
		}

		function addError(type, code, msg, row)
		{
			var error = {
				type: type,
				code: code,
				message: msg
			};
			if(row !== undefined) {
				error.row = row;
			}
			_results.errors.push(error);
		}
	}

	/** https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions */
	function escapeRegExp(string)
	{
		return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
	}

	/** The core parser implements speedy and correct CSV parsing */
	function Parser(config)
	{
		// Unpack the config object
		config = config || {};
		var delim = config.delimiter;
		var newline = config.newline;
		var comments = config.comments;
		var step = config.step;
		var quoteChar;
		var renamedHeaders = null;
		var headerParsed = false;

		if (config.quoteChar === undefined || config.quoteChar === null) {
			quoteChar = '"';
		} else {
			quoteChar = config.quoteChar;
		}
		var escapeChar = quoteChar;
		if (config.escapeChar !== undefined) {
			escapeChar = config.escapeChar;
		}

		// Delimiter must be valid
		if (typeof delim !== 'string'
			|| Papa.BAD_DELIMITERS.indexOf(delim) > -1)
			delim = ',';

		// Comment character must be valid
		if (comments === delim)
			throw new Error('Comment character same as delimiter');
		else if (comments === true)
			comments = '#';
		else if (typeof comments !== 'string'
			|| Papa.BAD_DELIMITERS.indexOf(comments) > -1)
			comments = false;

		// Newline must be valid: \r, \n, or \r\n
		if (newline !== '\n' && newline !== '\r' && newline !== '\r\n')
			newline = '\n';

		// We're gonna need these at the Parser scope
		var cursor = 0; // unit: UTF-8 characters
		// var firstByte = 0; // unit: bytes
		// var numBytes = 0; // unit: bytes
		var aborted = false;

		this.parse = function(input, baseIndex, ignoreLastRow)
		{
			// For some reason, in Chrome, this speeds things up (!?)
			if (typeof input !== 'string')
				throw new Error('Input must be a string');

			// We don't need to compute some of these every time parse() is called,
			// but having them in a more local scope seems to perform better
			var inputLen = input.length,
				delimLen = delim.length,
				newlineLen = newline.length,
				commentsLen = comments.length;
			var stepIsFunction = isFunction(step);

			// Establish starting state
			cursor = 0;
			var data = [], errors = [], row = [], lastCursor = 0;

			if (!input)
				return returnable();

			var nextDelim = input.indexOf(delim, cursor);
			var nextNewline = input.indexOf(newline, cursor);
			var quoteCharRegex = new RegExp(escapeRegExp(escapeChar) + escapeRegExp(quoteChar), 'g');
			var quoteSearch = input.indexOf(quoteChar, cursor);

			// Parser loop
			for (;;)
			{
				// Field has opening quote
				if (input[cursor] === quoteChar)
				{
					// Start our search for the closing quote where the cursor is
					quoteSearch = cursor;

					// Skip the opening quote
					cursor++;

					for (;;)
					{
						// Find closing quote
						quoteSearch = input.indexOf(quoteChar, quoteSearch + 1);

						//No other quotes are found - no other delimiters
						if (quoteSearch === -1)
						{
							if (!ignoreLastRow) {
								// No closing quote... what a pity
								errors.push({
									type: 'Quotes',
									code: 'MissingQuotes',
									message: 'Quoted field unterminated',
									row: data.length,	// row has yet to be inserted
									index: cursor
								});
							}
							return finish();
						}

						// Closing quote at EOF
						if (quoteSearch === inputLen - 1)
						{
							var value = input.substring(cursor, quoteSearch).replace(quoteCharRegex, quoteChar);
							return finish(value);
						}

						// If this quote is escaped, it's part of the data; skip it
						// If the quote character is the escape character, then check if the next character is the escape character
						if (quoteChar === escapeChar &&  input[quoteSearch + 1] === escapeChar)
						{
							quoteSearch++;
							continue;
						}

						// If the quote character is not the escape character, then check if the previous character was the escape character
						if (quoteChar !== escapeChar && quoteSearch !== 0 && input[quoteSearch - 1] === escapeChar)
						{
							continue;
						}

						if(nextDelim !== -1 && nextDelim < (quoteSearch + 1)) {
							nextDelim = input.indexOf(delim, (quoteSearch + 1));
						}
						if(nextNewline !== -1 && nextNewline < (quoteSearch + 1)) {
							nextNewline = input.indexOf(newline, (quoteSearch + 1));
						}
						// Check up to nextDelim or nextNewline, whichever is closest
						var checkUpTo = nextNewline === -1 ? nextDelim : Math.min(nextDelim, nextNewline);
						var spacesBetweenQuoteAndDelimiter = extraSpaces(checkUpTo);

						// Closing quote followed by delimiter or 'unnecessary spaces + delimiter'
						if (input.substr(quoteSearch + 1 + spacesBetweenQuoteAndDelimiter, delimLen) === delim)
						{
							row.push(input.substring(cursor, quoteSearch).replace(quoteCharRegex, quoteChar));
							cursor = quoteSearch + 1 + spacesBetweenQuoteAndDelimiter + delimLen;

							// If char after following delimiter is not quoteChar, we find next quote char position
							if (input[quoteSearch + 1 + spacesBetweenQuoteAndDelimiter + delimLen] !== quoteChar)
							{
								quoteSearch = input.indexOf(quoteChar, cursor);
							}
							nextDelim = input.indexOf(delim, cursor);
							nextNewline = input.indexOf(newline, cursor);
							break;
						}

						var spacesBetweenQuoteAndNewLine = extraSpaces(nextNewline);

						// Closing quote followed by newline or 'unnecessary spaces + newLine'
						if (input.substring(quoteSearch + 1 + spacesBetweenQuoteAndNewLine, quoteSearch + 1 + spacesBetweenQuoteAndNewLine + newlineLen) === newline)
						{
							row.push(input.substring(cursor, quoteSearch).replace(quoteCharRegex, quoteChar));
							saveRow(quoteSearch + 1 + spacesBetweenQuoteAndNewLine + newlineLen);
							nextDelim = input.indexOf(delim, cursor);	// because we may have skipped the nextDelim in the quoted field
							quoteSearch = input.indexOf(quoteChar, cursor);	// we search for first quote in next line

							if (stepIsFunction)
							{
								doStep();
								if (aborted)
									return returnable();
							}

							break;
						}


						// Checks for valid closing quotes are complete (escaped quotes or quote followed by EOF/delimiter/newline) -- assume these quotes are part of an invalid text string
						errors.push({
							type: 'Quotes',
							code: 'InvalidQuotes',
							message: 'Trailing quote on quoted field is malformed',
							row: data.length,	// row has yet to be inserted
							index: cursor
						});

						quoteSearch++;
						continue;

					}

					continue;
				}

				// Comment found at start of new line
				if (comments && row.length === 0 && input.substring(cursor, cursor + commentsLen) === comments)
				{
					if (nextNewline === -1)	// Comment ends at EOF
						return returnable();
					cursor = nextNewline + newlineLen;
					nextNewline = input.indexOf(newline, cursor);
					nextDelim = input.indexOf(delim, cursor);
					continue;
				}

				// Next delimiter comes before next newline, so we've reached end of field
				if (nextDelim !== -1 && (nextDelim < nextNewline || nextNewline === -1))
				{
					row.push(input.substring(cursor, nextDelim));
					cursor = nextDelim + delimLen;
					// we look for next delimiter char
					nextDelim = input.indexOf(delim, cursor);
					continue;
				}

				// End of row
				if (nextNewline !== -1)
				{
					row.push(input.substring(cursor, nextNewline));
					saveRow(nextNewline + newlineLen);

					if (stepIsFunction)
					{
						doStep();
						if (aborted)
							return returnable();
					}

					continue;
				}

				break;
			}

			return finish();


			function pushRow(row)
			{
				data.push(row);
				lastCursor = cursor;
			}

			/**
             * checks if there are extra spaces after closing quote and given index without any text
             * if Yes, returns the number of spaces
             */
			function extraSpaces(index) {
				var spaceLength = 0;
				if (index !== -1) {
					var textBetweenClosingQuoteAndIndex = input.substring(quoteSearch + 1, index);
					if (textBetweenClosingQuoteAndIndex && textBetweenClosingQuoteAndIndex.trim() === '') {
						spaceLength = textBetweenClosingQuoteAndIndex.length;
					}
				}
				return spaceLength;
			}

			/**
			 * Appends the remaining input from cursor to the end into
			 * row, saves the row, calls step, and returns the results.
			 */
			function finish(value)
			{
				if (ignoreLastRow)
					return returnable();
				if (typeof value === 'undefined')
					value = input.substring(cursor);
				row.push(value);
				cursor = inputLen;
				pushRow(row);
				if (stepIsFunction)
					doStep();
				return returnable();
			}

			/**
			 * Appends the current row to the results. It sets the cursor
			 * to newCursor and finds the nextNewline. The caller should
			 * take care to execute user's step function and end parsing
			 * if necessary.
			 */
			function saveRow(newCursor)
			{
				cursor = newCursor;
				pushRow(row);
				row = [];
				nextNewline = input.indexOf(newline, cursor);
			}

			/** Returns an object with the results, errors, and meta. */
			function returnable()
			{
				if (config.header && !baseIndex && data.length && !headerParsed)
				{
					const result = data[0];
					const headerCount = Object.create(null); // To track the count of each base header
					const usedHeaders = new Set(result); // To track used headers and avoid duplicates
					let duplicateHeaders = false;

					for (let i = 0; i < result.length; i++) {
						const header = stripBom(result[i]);

						if (!headerCount[header]) {
							headerCount[header] = 1;
							result[i] = header;
						} else {
							let newHeader;
							let suffixCount = headerCount[header];

							// Find a unique new header
							do {
								newHeader = `${header}_${suffixCount}`;
								suffixCount++;
							} while (usedHeaders.has(newHeader));

							usedHeaders.add(newHeader); // Mark this new Header as used
							result[i] = newHeader;
							headerCount[header]++;
							duplicateHeaders = true;
							if (renamedHeaders === null) {
								renamedHeaders = {};
							}
							renamedHeaders[newHeader] = header;
						}

						usedHeaders.add(header); // Ensure the original header is marked as used
					}
					if (duplicateHeaders) {
						console.warn('Duplicate headers found and renamed.');
					}
					headerParsed = true;
				}
				return {
					data: data,
					errors: errors,
					meta: {
						delimiter: delim,
						linebreak: newline,
						aborted: aborted,
						cursor: lastCursor + (baseIndex || 0),
						renamedHeaders: renamedHeaders
					}
				};
			}

			/** Executes the user's step function and resets data & errors. */
			function doStep()
			{
				step(returnable());
				data = [];
				errors = [];
			}
		};

		/** Sets the abort flag */
		this.abort = function()
		{
			aborted = true;
		};
	}

	/** Makes a deep copy of an array or object (mostly) */
	function copy(obj)
	{
		if (typeof obj !== 'object' || obj === null)
			return obj;
		var cpy = Array.isArray(obj) ? [] : {};
		for (var key in obj)
			cpy[key] = copy(obj[key]);
		return cpy;
	}

	function bindFunction(f, self)
	{
		return function() { f.apply(self, arguments); };
	}
	function isFunction(func)
	{
		return typeof func === 'function';
	}

	return Papa;
}));
