var chai;
var Papa;
if (typeof module !== 'undefined' && module.exports) {
	chai = require('chai');
	Papa = require('../papaparse.js');
}

var assert = chai.assert;

var BASE_PATH = (typeof document === 'undefined') ? './' : document.getElementById('test-cases').src.replace(/test-cases\.js$/, '');
var RECORD_SEP = String.fromCharCode(30);
var UNIT_SEP = String.fromCharCode(31);

var XHR_ENABLED = false;
try {
	new XMLHttpRequest(); // eslint-disable-line no-new
	XHR_ENABLED = true;
} catch (e) {} // safari, ie

// Tests for the core parser using new Papa.Parser().parse() (CSV to JSON)
var CORE_PARSER_TESTS = [
	{
		description: "One row",
		input: 'A,b,c',
		expected: {
			data: [['A', 'b', 'c']],
			errors: [],
			meta: {delimiter: ',', renamedHeaders: null}
		}
	},
	{
		description: "Two rows",
		input: 'A,b,c\nd,E,f',
		expected: {
			data: [['A', 'b', 'c'], ['d', 'E', 'f']],
			errors: []
		}
	},
	{
		description: "Three rows",
		input: 'A,b,c\nd,E,f\nG,h,i',
		expected: {
			data: [['A', 'b', 'c'], ['d', 'E', 'f'], ['G', 'h', 'i']],
			errors: []
		}
	},
	{
		description: "Whitespace at edges of unquoted field",
		input: 'a,	b ,c',
		notes: "Extra whitespace should graciously be preserved",
		expected: {
			data: [['a', '	b ', 'c']],
			errors: []
		}
	},
	{
		description: "Quoted field",
		input: 'A,"B",C',
		expected: {
			data: [['A', 'B', 'C']],
			errors: []
		}
	},
	{
		description: "Quoted field with extra whitespace on edges",
		input: 'A," B  ",C',
		expected: {
			data: [['A', ' B  ', 'C']],
			errors: []
		}
	},
	{
		description: "Quoted field with delimiter",
		input: 'A,"B,B",C',
		expected: {
			data: [['A', 'B,B', 'C']],
			errors: []
		}
	},
	{
		description: "Quoted field with line break",
		input: 'A,"B\nB",C',
		expected: {
			data: [['A', 'B\nB', 'C']],
			errors: []
		}
	},
	{
		description: "Quoted fields with line breaks",
		input: 'A,"B\nB","C\nC\nC"',
		expected: {
			data: [['A', 'B\nB', 'C\nC\nC']],
			errors: []
		}
	},
	{
		description: "Quoted fields at end of row with delimiter and line break",
		input: 'a,b,"c,c\nc"\nd,e,f',
		expected: {
			data: [['a', 'b', 'c,c\nc'], ['d', 'e', 'f']],
			errors: []
		}
	},
	{
		description: "Quoted field with escaped quotes",
		input: 'A,"B""B""B",C',
		expected: {
			data: [['A', 'B"B"B', 'C']],
			errors: []
		}
	},
	{
		description: "Quoted field with escaped quotes at boundaries",
		input: 'A,"""B""",C',
		expected: {
			data: [['A', '"B"', 'C']],
			errors: []
		}
	},
	{
		description: "Unquoted field with quotes at end of field",
		notes: "The quotes character is misplaced, but shouldn't generate an error or break the parser",
		input: 'A,B",C',
		expected: {
			data: [['A', 'B"', 'C']],
			errors: []
		}
	},
	{
		description: "Quoted field with quotes around delimiter",
		input: 'A,""",""",C',
		notes: "For a boundary to exist immediately before the quotes, we must not already be in quotes",
		expected: {
			data: [['A', '","', 'C']],
			errors: []
		}
	},
	{
		description: "Quoted field with quotes on right side of delimiter",
		input: 'A,",""",C',
		notes: "Similar to the test above but with quotes only after the comma",
		expected: {
			data: [['A', ',"', 'C']],
			errors: []
		}
	},
	{
		description: "Quoted field with quotes on left side of delimiter",
		input: 'A,""",",C',
		notes: "Similar to the test above but with quotes only before the comma",
		expected: {
			data: [['A', '",', 'C']],
			errors: []
		}
	},
	{
		description: "Quoted field with 5 quotes in a row and a delimiter in there, too",
		input: '"1","cnonce="""",nc=""""","2"',
		notes: "Actual input reported in issue #121",
		expected: {
			data: [['1', 'cnonce="",nc=""', '2']],
			errors: []
		}
	},
	{
		description: "Quoted field with whitespace around quotes",
		input: 'A, "B" ,C',
		notes: "The quotes must be immediately adjacent to the delimiter to indicate a quoted field",
		expected: {
			data: [['A', ' "B" ', 'C']],
			errors: []
		}
	},
	{
		description: "Misplaced quotes in data, not as opening quotes",
		input: 'A,B "B",C',
		notes: "The input is technically malformed, but this syntax should not cause an error",
		expected: {
			data: [['A', 'B "B"', 'C']],
			errors: []
		}
	},
	{
		description: "Quoted field has no closing quote",
		input: 'a,"b,c\nd,e,f',
		expected: {
			data: [['a', 'b,c\nd,e,f']],
			errors: [{
				"type": "Quotes",
				"code": "MissingQuotes",
				"message": "Quoted field unterminated",
				"row": 0,
				"index": 3
			}]
		}
	},
	{
		description: "Quoted field has invalid trailing quote after delimiter with a valid closer",
		input: '"a,"b,c"\nd,e,f',
		notes: "The input is malformed, opening quotes identified, trailing quote is malformed. Trailing quote should be escaped or followed by valid new line or delimiter to be valid",
		expected: {
			data: [['a,"b,c'], ['d', 'e', 'f']],
			errors: [{
				"type": "Quotes",
				"code": "InvalidQuotes",
				"message": "Trailing quote on quoted field is malformed",
				"row": 0,
				"index": 1
			}]
		}
	},
	{
		description: "Quoted field has invalid trailing quote after delimiter",
		input: 'a,"b,"c\nd,e,f',
		notes: "The input is malformed, opening quotes identified, trailing quote is malformed. Trailing quote should be escaped or followed by valid new line or delimiter to be valid",
		expected: {
			data: [['a', 'b,"c\nd,e,f']],
			errors: [{
				"type": "Quotes",
				"code": "InvalidQuotes",
				"message": "Trailing quote on quoted field is malformed",
				"row": 0,
				"index": 3
			},
			{
				"type": "Quotes",
				"code": "MissingQuotes",
				"message": "Quoted field unterminated",
				"row": 0,
				"index": 3
			}]
		}
	},
	{
		description: "Quoted field has invalid trailing quote before delimiter",
		input: 'a,"b"c,d\ne,f,g',
		notes: "The input is malformed, opening quotes identified, trailing quote is malformed. Trailing quote should be escaped or followed by valid new line or delimiter to be valid",
		expected: {
			data: [['a', 'b"c,d\ne,f,g']],
			errors: [{
				"type": "Quotes",
				"code": "InvalidQuotes",
				"message": "Trailing quote on quoted field is malformed",
				"row": 0,
				"index": 3
			},
			{
				"type": "Quotes",
				"code": "MissingQuotes",
				"message": "Quoted field unterminated",
				"row": 0,
				"index": 3
			}]
		}
	},
	{
		description: "Quoted field has invalid trailing quote after new line",
		input: 'a,"b,c\nd"e,f,g',
		notes: "The input is malformed, opening quotes identified, trailing quote is malformed. Trailing quote should be escaped or followed by valid new line or delimiter to be valid",
		expected: {
			data: [['a', 'b,c\nd"e,f,g']],
			errors: [{
				"type": "Quotes",
				"code": "InvalidQuotes",
				"message": "Trailing quote on quoted field is malformed",
				"row": 0,
				"index": 3
			},
			{
				"type": "Quotes",
				"code": "MissingQuotes",
				"message": "Quoted field unterminated",
				"row": 0,
				"index": 3
			}]
		}
	},
	{
		description: "Quoted field has valid trailing quote via delimiter",
		input: 'a,"b",c\nd,e,f',
		notes: "Trailing quote is valid due to trailing delimiter",
		expected: {
			data: [['a', 'b', 'c'], ['d', 'e', 'f']],
			errors: []
		}
	},
	{
		description: "Quoted field has valid trailing quote via \\n",
		input: 'a,b,"c"\nd,e,f',
		notes: "Trailing quote is valid due to trailing new line delimiter",
		expected: {
			data: [['a', 'b', 'c'], ['d', 'e', 'f']],
			errors: []
		}
	},
	{
		description: "Quoted field has valid trailing quote via EOF",
		input: 'a,b,c\nd,e,"f"',
		notes: "Trailing quote is valid due to EOF",
		expected: {
			data: [['a', 'b', 'c'], ['d', 'e', 'f']],
			errors: []
		}
	},
	{
		description: "Quoted field contains delimiters and \\n with valid trailing quote",
		input: 'a,"b,c\nd,e,f"',
		notes: "Trailing quote is valid due to trailing delimiter",
		expected: {
			data: [['a', 'b,c\nd,e,f']],
			errors: []
		}
	},
	{
		description: "Line starts with quoted field",
		input: 'a,b,c\n"d",e,f',
		expected: {
			data: [['a', 'b', 'c'], ['d', 'e', 'f']],
			errors: []
		}
	},
	{
		description: "Line starts with unquoted empty field",
		input: ',b,c\n"d",e,f',
		expected: {
			data: [['', 'b', 'c'], ['d', 'e', 'f']],
			errors: []
		}
	},
	{
		description: "Line ends with quoted field",
		input: 'a,b,c\nd,e,f\n"g","h","i"\n"j","k","l"',
		expected: {
			data: [['a', 'b', 'c'], ['d', 'e', 'f'], ['g', 'h', 'i'], ['j', 'k', 'l']],
			errors: []
		}
	},
	{
		description: "Line ends with quoted field, first field of next line is empty, \\n",
		input: 'a,b,c\n,e,f\n,"h","i"\n,"k","l"',
		config: {
			newline: '\n',
		},
		expected: {
			data: [['a', 'b', 'c'], ['', 'e', 'f'], ['', 'h', 'i'], ['', 'k', 'l']],
			errors: []
		}
	},
	{
		description: "Quoted field at end of row (but not at EOF) has quotes",
		input: 'a,b,"c""c"""\nd,e,f',
		expected: {
			data: [['a', 'b', 'c"c"'], ['d', 'e', 'f']],
			errors: []
		}
	},
	{
		description: "Empty quoted field at EOF is empty",
		input: 'a,b,""\na,b,""',
		expected: {
			data: [['a', 'b', ''], ['a', 'b', '']],
			errors: []
		}
	},
	{
		description: "Multiple consecutive empty fields",
		input: 'a,b,,,c,d\n,,e,,,f',
		expected: {
			data: [['a', 'b', '', '', 'c', 'd'], ['', '', 'e', '', '', 'f']],
			errors: []
		}
	},
	{
		description: "Empty input string",
		input: '',
		expected: {
			data: [],
			errors: []
		}
	},
	{
		description: "Input is just the delimiter (2 empty fields)",
		input: ',',
		expected: {
			data: [['', '']],
			errors: []
		}
	},
	{
		description: "Input is just empty fields",
		input: ',,\n,,,',
		expected: {
			data: [['', '', ''], ['', '', '', '']],
			errors: []
		}
	},
	{
		description: "Input is just a string (a single field)",
		input: 'Abc def',
		expected: {
			data: [['Abc def']],
			errors: []
		}
	},
	{
		description: "Commented line at beginning",
		input: '# Comment!\na,b,c',
		config: { comments: true },
		expected: {
			data: [['a', 'b', 'c']],
			errors: []
		}
	},
	{
		description: "Commented line in middle",
		input: 'a,b,c\n# Comment\nd,e,f',
		config: { comments: true },
		expected: {
			data: [['a', 'b', 'c'], ['d', 'e', 'f']],
			errors: []
		}
	},
	{
		description: "Commented line at end",
		input: 'a,true,false\n# Comment',
		config: { comments: true },
		expected: {
			data: [['a', 'true', 'false']],
			errors: []
		}
	},
	{
		description: "Two comment lines consecutively",
		input: 'a,b,c\n#comment1\n#comment2\nd,e,f',
		config: { comments: true },
		expected: {
			data: [['a', 'b', 'c'], ['d', 'e', 'f']],
			errors: []
		}
	},
	{
		description: "Two comment lines consecutively at end of file",
		input: 'a,b,c\n#comment1\n#comment2',
		config: { comments: true },
		expected: {
			data: [['a', 'b', 'c']],
			errors: []
		}
	},
	{
		description: "Three comment lines consecutively at beginning of file",
		input: '#comment1\n#comment2\n#comment3\na,b,c',
		config: { comments: true },
		expected: {
			data: [['a', 'b', 'c']],
			errors: []
		}
	},
	{
		description: "Entire file is comment lines",
		input: '#comment1\n#comment2\n#comment3',
		config: { comments: true },
		expected: {
			data: [],
			errors: []
		}
	},
	{
		description: "Comment with non-default character",
		input: 'a,b,c\n!Comment goes here\nd,e,f',
		config: { comments: '!' },
		expected: {
			data: [['a', 'b', 'c'], ['d', 'e', 'f']],
			errors: []
		}
	},
	{
		description: "Bad comments value specified",
		notes: "Should silently disable comment parsing",
		input: 'a,b,c\n5comment\nd,e,f',
		config: { comments: 5 },
		expected: {
			data: [['a', 'b', 'c'], ['5comment'], ['d', 'e', 'f']],
			errors: []
		}
	},
	{
		description: "Multi-character comment string",
		input: 'a,b,c\n=N(Comment)\nd,e,f',
		config: { comments: "=N(" },
		expected: {
			data: [['a', 'b', 'c'], ['d', 'e', 'f']],
			errors: []
		}
	},
	{
		description: "Input with only a commented line",
		input: '#commented line',
		config: { comments: true, delimiter: ',' },
		expected: {
			data: [],
			errors: []
		}
	},
	{
		description: "Input with only a commented line and blank line after",
		input: '#commented line\n',
		config: { comments: true, delimiter: ',' },
		expected: {
			data: [['']],
			errors: []
		}
	},
	{
		description: "Input with only a commented line, without comments enabled",
		input: '#commented line',
		config: { delimiter: ',' },
		expected: {
			data: [['#commented line']],
			errors: []
		}
	},
	{
		description: "Input without comments with line starting with whitespace",
		input: 'a\n b\nc',
		config: { delimiter: ',' },
		notes: "\" \" == false, but \" \" !== false, so === comparison is required",
		expected: {
			data: [['a'], [' b'], ['c']],
			errors: []
		}
	},
	{
		description: "Multiple rows, one column (no delimiter found)",
		input: 'a\nb\nc\nd\ne',
		expected: {
			data: [['a'], ['b'], ['c'], ['d'], ['e']],
			errors: []
		}
	},
	{
		description: "One column input with empty fields",
		input: 'a\nb\n\n\nc\nd\ne\n',
		expected: {
			data: [['a'], ['b'], [''], [''], ['c'], ['d'], ['e'], ['']],
			errors: []
		}
	},
	{
		description: "Simple duplicated header names",
		input: 'A,A,A,A\n1,2,3,4',
		config: { header: true },
		expected: {
			data: [['A', 'A_1', 'A_2', 'A_3'], ['1', '2', '3', '4']],
			errors: [],
			meta: {
				renamedHeaders: {A_1: 'A', A_2: 'A', A_3: 'A'},
				cursor: 15
			}
		}
	},
	{
		description: "Duplicated header names existing column",
		input: 'c,c,c,c_1\n1,2,3,4',
		config: { header: true },
		expected: {
			data: [['c', 'c_2', 'c_3', 'c_1'], ['1', '2', '3', '4']],
			errors: [],
			meta: {
				renamedHeaders: {c_2: 'c', c_3: 'c'},
				cursor: 17
			}
		}
	},
	{
		description: "Duplicate header names with __proto__ field",
		input: '__proto__,__proto__,__proto__\n1,2,3',
		config: { header: true },
		expected: {
			data: [['__proto__', '__proto___1', '__proto___2'], ['1', '2', '3']],
			errors: [],
			meta: {
				renamedHeaders: {__proto___1: '__proto__', __proto___2: '__proto__'},
				cursor: 35
			}
		}
	},

];

describe('Core Parser Tests', function() {
	function generateTest(test) {
		(test.disabled ? it.skip : it)(test.description, function() {
			var actual = new Papa.Parser(test.config).parse(test.input);
			assert.deepEqual(actual.errors, test.expected.errors);
			assert.deepEqual(actual.data, test.expected.data);
			assert.deepNestedInclude(actual.meta, test.expected.meta || {});
		});
	}

	for (var i = 0; i < CORE_PARSER_TESTS.length; i++) {
		generateTest(CORE_PARSER_TESTS[i]);
	}
});



// Tests for Papa.parse() function -- high-level wrapped parser (CSV to JSON)
var PARSE_TESTS = [
	{
		description: "Two rows, just \\r",
		input: 'A,b,c\rd,E,f',
		expected: {
			data: [['A', 'b', 'c'], ['d', 'E', 'f']],
			errors: []
		}
	},
	{
		description: "Two rows, \\r\\n",
		input: 'A,b,c\r\nd,E,f',
		expected: {
			data: [['A', 'b', 'c'], ['d', 'E', 'f']],
			errors: []
		}
	},
	{
		description: "Quoted field with \\r\\n",
		input: 'A,"B\r\nB",C',
		expected: {
			data: [['A', 'B\r\nB', 'C']],
			errors: []
		}
	},
	{
		description: "Quoted field with \\r",
		input: 'A,"B\rB",C',
		expected: {
			data: [['A', 'B\rB', 'C']],
			errors: []
		}
	},
	{
		description: "Quoted field with \\n",
		input: 'A,"B\nB",C',
		expected: {
			data: [['A', 'B\nB', 'C']],
			errors: []
		}
	},
	{
		description: "Quoted fields with spaces between closing quote and next delimiter",
		input: 'A,"B" ,C,D\r\nE,F,"G"  ,H',
		expected: {
			data: [['A', 'B', 'C','D'],['E', 'F', 'G','H']],
			errors: []
		}
	},
	{
		description: "Quoted fields with spaces between closing quote and next new line",
		input: 'A,B,C,"D" \r\nE,F,G,"H"  \r\nQ,W,E,R',
		expected: {
			data: [['A', 'B', 'C','D'],['E', 'F', 'G','H'],['Q', 'W', 'E','R']],
			errors: []
		}
	},
	{
		description: "Quoted fields with spaces after closing quote",
		input: 'A,"B" ,C,"D" \r\nE,F,"G"  ,"H"  \r\nQ,W,"E" ,R',
		expected: {
			data: [['A', 'B', 'C','D'],['E', 'F', 'G','H'],['Q', 'W', 'E','R']],
			errors: []
		}
	},
	{
		description: "Misplaced quotes in data twice, not as opening quotes",
		input: 'A,B",C\nD,E",F',
		expected: {
			data: [['A', 'B"', 'C'], ['D', 'E"', 'F']],
			errors: []
		}
	},
	{
		description: "Mixed slash n and slash r should choose first as precident",
		input: 'a,b,c\nd,e,f\rg,h,i\n',
		expected: {
			data: [['a', 'b', 'c'], ['d', 'e', 'f\rg', 'h', 'i'], ['']],
			errors: []
		}
	},
	{
		description: "Header row with one row of data",
		input: 'A,B,C\r\na,b,c',
		config: { header: true },
		expected: {
			data: [{"A": "a", "B": "b", "C": "c"}],
			errors: []
		}
	},
	{
		description: "Header row only",
		input: 'A,B,C',
		config: { header: true },
		expected: {
			data: [],
			errors: []
		}
	},
	{
		description: "Row with too few fields",
		input: 'A,B,C\r\na,b',
		config: { header: true },
		expected: {
			data: [{"A": "a", "B": "b"}],
			errors: [{
				"type": "FieldMismatch",
				"code": "TooFewFields",
				"message": "Too few fields: expected 3 fields but parsed 2",
				"row": 0
			}]
		}
	},
	{
		description: "Row with too many fields",
		input: 'A,B,C\r\na,b,c,d,e\r\nf,g,h',
		config: { header: true },
		expected: {
			data: [{"A": "a", "B": "b", "C": "c", "__parsed_extra": ["d", "e"]}, {"A": "f", "B": "g", "C": "h"}],
			errors: [{
				"type": "FieldMismatch",
				"code": "TooManyFields",
				"message": "Too many fields: expected 3 fields but parsed 5",
				"row": 0
			}]
		}
	},
	{
		description: "Row with enough fields but blank field in the begining",
		input: 'A,B,C\r\n,b1,c1\r\na2,b2,c2',
		expected: {
			data: [["A", "B", "C"], ['', 'b1', 'c1'], ['a2', 'b2', 'c2']],
			errors: []
		}
	},
	{
		description: "Row with enough fields but blank field in the begining using headers",
		input: 'A,B,C\r\n,b1,c1\r\n,b2,c2',
		config: { header: true },
		expected: {
			data: [{"A": "", "B": "b1", "C": "c1"}, {"A": "", "B": "b2", "C": "c2"}],
			errors: []
		}
	},
	{
		description: "Row with enough fields but blank field at end",
		input: 'A,B,C\r\na,b,',
		config: { header: true },
		expected: {
			data: [{"A": "a", "B": "b", "C": ""}],
			errors: []
		}
	},
	{
		description: "Line ends with quoted field, first field of next line is empty using headers",
		input: 'a,b,"c"\r\nd,e,"f"\r\n,"h","i"\r\n,"k","l"',
		config: {
			header: true,
			newline: '\r\n',
		},
		expected: {
			data: [
				{a: 'd', b: 'e', c: 'f'},
				{a: '', b: 'h', c: 'i'},
				{a: '', b: 'k', c: 'l'}
			],
			errors: []
		}
	},
	{
		description: "Tab delimiter",
		input: 'a\tb\tc\r\nd\te\tf',
		config: { delimiter: "\t" },
		expected: {
			data: [['a', 'b', 'c'], ['d', 'e', 'f']],
			errors: []
		}
	},
	{
		description: "Pipe delimiter",
		input: 'a|b|c\r\nd|e|f',
		config: { delimiter: "|" },
		expected: {
			data: [['a', 'b', 'c'], ['d', 'e', 'f']],
			errors: []
		}
	},
	{
		description: "ASCII 30 delimiter",
		input: 'a' + RECORD_SEP + 'b' + RECORD_SEP + 'c\r\nd' + RECORD_SEP + 'e' + RECORD_SEP + 'f',
		config: { delimiter: RECORD_SEP },
		expected: {
			data: [['a', 'b', 'c'], ['d', 'e', 'f']],
			errors: []
		}
	},
	{
		description: "ASCII 31 delimiter",
		input: 'a' + UNIT_SEP + 'b' + UNIT_SEP + 'c\r\nd' + UNIT_SEP + 'e' + UNIT_SEP + 'f',
		config: { delimiter: UNIT_SEP },
		expected: {
			data: [['a', 'b', 'c'], ['d', 'e', 'f']],
			errors: []
		}
	},
	{
		description: "Bad delimiter (\\n)",
		input: 'a,b,c',
		config: { delimiter: "\n" },
		notes: "Should silently default to comma",
		expected: {
			data: [['a', 'b', 'c']],
			errors: []
		}
	},
	{
		description: "Multi-character delimiter",
		input: 'a, b, c',
		config: { delimiter: ", " },
		expected: {
			data: [['a', 'b', 'c']],
			errors: []
		}
	},
	{
		description: "Multi-character delimiter (length 2) with quoted field",
		input: 'a, b, "c, e", d',
		config: { delimiter: ", " },
		notes: "The quotes must be immediately adjacent to the delimiter to indicate a quoted field",
		expected: {
			data: [['a', 'b', 'c, e', 'd']],
			errors: []
		}
	},
	{
		description: "Callback delimiter",
		input: 'a$ b$ c',
		config: { delimiter: function(input) { return input[1] + ' '; } },
		expected: {
			data: [['a', 'b', 'c']],
			errors: []
		}
	},
	{
		description: "Blank line at beginning",
		input: '\r\na,b,c\r\nd,e,f',
		config: { newline: '\r\n' },
		expected: {
			data: [[''], ['a', 'b', 'c'], ['d', 'e', 'f']],
			errors: []
		}
	},
	{
		description: "Blank line in middle",
		input: 'a,b,c\r\n\r\nd,e,f',
		config: { newline: '\r\n' },
		expected: {
			data: [['a', 'b', 'c'], [''], ['d', 'e', 'f']],
			errors: []
		}
	},
	{
		description: "Blank lines at end",
		input: 'a,b,c\nd,e,f\n\n',
		expected: {
			data: [['a', 'b', 'c'], ['d', 'e', 'f'], [''], ['']],
			errors: []
		}
	},
	{
		description: "Blank line in middle with whitespace",
		input: 'a,b,c\r\n \r\nd,e,f',
		expected: {
			data: [['a', 'b', 'c'], [" "], ['d', 'e', 'f']],
			errors: []
		}
	},
	{
		description: "First field of a line is empty",
		input: 'a,b,c\r\n,e,f',
		expected: {
			data: [['a', 'b', 'c'], ['', 'e', 'f']],
			errors: []
		}
	},
	{
		description: "Last field of a line is empty",
		input: 'a,b,\r\nd,e,f',
		expected: {
			data: [['a', 'b', ''], ['d', 'e', 'f']],
			errors: []
		}
	},
	{
		description: "Other fields are empty",
		input: 'a,,c\r\n,,',
		expected: {
			data: [['a', '', 'c'], ['', '', '']],
			errors: []
		}
	},
	{
		description: "Empty input string",
		input: '',
		expected: {
			data: [],
			errors: [{
				"type": "Delimiter",
				"code": "UndetectableDelimiter",
				"message": "Unable to auto-detect delimiting character; defaulted to ','"
			}]
		}
	},
	{
		description: "Input is just the delimiter (2 empty fields)",
		input: ',',
		expected: {
			data: [['', '']],
			errors: []
		}
	},
	{
		description: "Input is just a string (a single field)",
		input: 'Abc def',
		expected: {
			data: [['Abc def']],
			errors: [
				{
					"type": "Delimiter",
					"code": "UndetectableDelimiter",
					"message": "Unable to auto-detect delimiting character; defaulted to ','"
				}
			]
		}
	},
	{
		description: "Preview 0 rows should default to parsing all",
		input: 'a,b,c\r\nd,e,f\r\ng,h,i',
		config: { preview: 0 },
		expected: {
			data: [['a', 'b', 'c'], ['d', 'e', 'f'], ['g', 'h', 'i']],
			errors: []
		}
	},
	{
		description: "Preview 1 row",
		input: 'a,b,c\r\nd,e,f\r\ng,h,i',
		config: { preview: 1 },
		expected: {
			data: [['a', 'b', 'c']],
			errors: []
		}
	},
	{
		description: "Preview 2 rows",
		input: 'a,b,c\r\nd,e,f\r\ng,h,i',
		config: { preview: 2 },
		expected: {
			data: [['a', 'b', 'c'], ['d', 'e', 'f']],
			errors: []
		}
	},
	{
		description: "Preview all (3) rows",
		input: 'a,b,c\r\nd,e,f\r\ng,h,i',
		config: { preview: 3 },
		expected: {
			data: [['a', 'b', 'c'], ['d', 'e', 'f'], ['g', 'h', 'i']],
			errors: []
		}
	},
	{
		description: "Preview more rows than input has",
		input: 'a,b,c\r\nd,e,f\r\ng,h,i',
		config: { preview: 4 },
		expected: {
			data: [['a', 'b', 'c'], ['d', 'e', 'f'], ['g', 'h', 'i']],
			errors: []
		}
	},
	{
		description: "Preview should count rows, not lines",
		input: 'a,b,c\r\nd,e,"f\r\nf",g,h,i',
		config: { preview: 2 },
		expected: {
			data: [['a', 'b', 'c'], ['d', 'e', 'f\r\nf', 'g', 'h', 'i']],
			errors: []
		}
	},
	{
		description: "Preview with header row",
		notes: "Preview is defined to be number of rows of input not including header row",
		input: 'a,b,c\r\nd,e,f\r\ng,h,i\r\nj,k,l',
		config: { header: true, preview: 2 },
		expected: {
			data: [{"a": "d", "b": "e", "c": "f"}, {"a": "g", "b": "h", "c": "i"}],
			errors: []
		}
	},
	{
		description: "Empty lines",
		input: '\na,b,c\n\nd,e,f\n\n',
		config: { delimiter: ',' },
		expected: {
			data: [[''], ['a', 'b', 'c'], [''], ['d', 'e', 'f'], [''], ['']],
			errors: []
		}
	},
	{
		description: "Skip empty lines",
		input: 'a,b,c\n\nd,e,f',
		config: { skipEmptyLines: true },
		expected: {
			data: [['a', 'b', 'c'], ['d', 'e', 'f']],
			errors: []
		}
	},
	{
		description: "Skip empty lines, with newline at end of input",
		input: 'a,b,c\r\n\r\nd,e,f\r\n',
		config: { skipEmptyLines: true },
		expected: {
			data: [['a', 'b', 'c'], ['d', 'e', 'f']],
			errors: []
		}
	},
	{
		description: "Skip empty lines, with empty input",
		input: '',
		config: { skipEmptyLines: true },
		expected: {
			data: [],
			errors: [
				{
					"type": "Delimiter",
					"code": "UndetectableDelimiter",
					"message": "Unable to auto-detect delimiting character; defaulted to ','"
				}
			]
		}
	},
	{
		description: "Skip empty lines, with first line only whitespace",
		notes: "A line must be absolutely empty to be considered empty",
		input: ' \na,b,c',
		config: { skipEmptyLines: true, delimiter: ',' },
		expected: {
			data: [[" "], ['a', 'b', 'c']],
			errors: []
		}
	},
	{
		description: "Skip empty lines while detecting delimiter",
		notes: "Parsing correctly newline-terminated short data with delimiter:auto and skipEmptyLines:true",
		input: 'a,b\n1,2\n3,4\n',
		config: { header: true, skipEmptyLines: true },
		expected: {
			data: [{'a': '1', 'b': '2'}, {'a': '3', 'b': '4'}],
			errors: []
		}
	},
	{
		description: "Lines with comments are not used when guessing the delimiter in an escaped file",
		notes: "Guessing the delimiter should work even if there are many lines of comments at the start of the file",
		input: '#1\n#2\n#3\n#4\n#5\n#6\n#7\n#8\n#9\n#10\none,"t,w,o",three\nfour,five,six',
		config: { comments: '#' },
		expected: {
			data: [['one','t,w,o','three'],['four','five','six']],
			errors: []
		}
	},
	{
		description: "Lines with comments are not used when guessing the delimiter in a non-escaped file",
		notes: "Guessing the delimiter should work even if there are many lines of comments at the start of the file",
		input: '#1\n#2\n#3\n#4\n#5\n#6\n#7\n#8\n#9\n#10\n#11\none,two,three\nfour,five,six',
		config: { comments: '#' },
		expected: {
			data: [['one','two','three'],['four','five','six']],
			errors: []
		}
	},
	{
		description: "Pipe delimiter is guessed correctly when mixed with comas",
		notes: "Guessing the delimiter should work even if there are many lines of comments at the start of the file",
		input: 'one|two,two|three\nfour|five,five|six',
		config: {},
		expected: {
			data: [['one','two,two','three'],['four','five,five','six']],
			errors: []
		}
	},
	{
		description: "Pipe delimiter is guessed correctly choose avgFildCount max one",
		notes: "Guessing the delimiter should work choose the min delta one and the max one",
		config: {},
		input: 'a,b,c\na,b,c|d|e|f',
		expected: {
			data: [['a', 'b', 'c'], ['a','b','c|d|e|f']],
			errors: []
		}
	},
	{
		description: "Pipe delimiter is guessed correctly when first field are enclosed in quotes and contain delimiter characters",
		notes: "Guessing the delimiter should work if the first field is enclosed in quotes, but others are not",
		input: '"Field1,1,1";Field2;"Field3";Field4;Field5;Field6',
		config: {},
		expected: {
			data: [['Field1,1,1','Field2','Field3', 'Field4', 'Field5', 'Field6']],
			errors: []
		}
	},
	{
		description: "Pipe delimiter is guessed correctly when some fields are enclosed in quotes and contain delimiter characters and escaoped quotes",
		notes: "Guessing the delimiter should work even if the first field is not enclosed in quotes, but others are",
		input: 'Field1;Field2;"Field,3,""3,3";Field4;Field5;"Field6,6"',
		config: {},
		expected: {
			data: [['Field1','Field2','Field,3,"3,3', 'Field4', 'Field5', 'Field6,6']],
			errors: []
		}
	},
	{
		description: "Single quote as quote character",
		notes: "Must parse correctly when single quote is specified as a quote character",
		input: "a,b,'c,d'",
		config: { quoteChar: "'" },
		expected: {
			data: [['a', 'b', 'c,d']],
			errors: []
		}
	},
	{
		description: "Custom escape character in the middle",
		notes: "Must parse correctly if the backslash sign (\\) is configured as a custom escape character",
		input: 'a,b,"c\\"d\\"f"',
		config: { escapeChar: '\\' },
		expected: {
			data: [['a', 'b', 'c"d"f']],
			errors: []
		}
	},
	{
		description: "Custom escape character at the end",
		notes: "Must parse correctly if the backslash sign (\\) is configured as a custom escape character and the escaped quote character appears at the end of the column",
		input: 'a,b,"c\\"d\\""',
		config: { escapeChar: '\\' },
		expected: {
			data: [['a', 'b', 'c"d"']],
			errors: []
		}
	},
	{
		description: "Custom escape character not used for escaping",
		notes: "Must parse correctly if the backslash sign (\\) is configured as a custom escape character and appears as regular character in the text",
		input: 'a,b,"c\\d"',
		config: { escapeChar: '\\' },
		expected: {
			data: [['a', 'b', 'c\\d']],
			errors: []
		}
	},
	{
		description: "Header row with preceding comment",
		notes: "Must parse correctly headers if they are preceded by comments",
		input: '#Comment\na,b\nc,d\n',
		config: { header: true, comments: '#', skipEmptyLines: true, delimiter: ',' },
		expected: {
			data: [{'a': 'c', 'b': 'd'}],
			errors: []
		}
	},
	{
		description: "Carriage return in header inside quotes, with line feed endings",
		input: '"a\r\na","b"\n"c","d"\n"e","f"\n"g","h"\n"i","j"',
		config: {},
		expected: {
			data: [['a\r\na', 'b'], ['c', 'd'], ['e', 'f'], ['g', 'h'], ['i', 'j']],
			errors: []
		}
	},
	{
		description: "Line feed in header inside quotes, with carriage return + line feed endings",
		input: '"a\na","b"\r\n"c","d"\r\n"e","f"\r\n"g","h"\r\n"i","j"',
		config: {},
		expected: {
			data: [['a\na', 'b'], ['c', 'd'], ['e', 'f'], ['g', 'h'], ['i', 'j']],
			errors: []
		}
	},
	{
		description: "Using \\r\\n endings uses \\r\\n linebreak",
		input: 'a,b\r\nc,d\r\ne,f\r\ng,h\r\ni,j',
		config: {},
		expected: {
			data: [['a', 'b'], ['c', 'd'], ['e', 'f'], ['g', 'h'], ['i', 'j']],
			errors: [],
			meta: {
				linebreak: '\r\n',
				delimiter: ',',
				cursor: 23,
				aborted: false,
				truncated: false,
				renamedHeaders: null
			}
		}
	},
	{
		description: "Using \\n endings uses \\n linebreak",
		input: 'a,b\nc,d\ne,f\ng,h\ni,j',
		config: {},
		expected: {
			data: [['a', 'b'], ['c', 'd'], ['e', 'f'], ['g', 'h'], ['i', 'j']],
			errors: [],
			meta: {
				linebreak: '\n',
				delimiter: ',',
				cursor: 19,
				aborted: false,
				truncated: false,
				renamedHeaders: null
			}
		}
	},
	{
		description: "Using \\r\\n endings with \\r\\n in header field uses \\r\\n linebreak",
		input: '"a\r\na",b\r\nc,d\r\ne,f\r\ng,h\r\ni,j',
		config: {},
		expected: {
			data: [['a\r\na', 'b'], ['c', 'd'], ['e', 'f'], ['g', 'h'], ['i', 'j']],
			errors: [],
			meta: {
				linebreak: '\r\n',
				delimiter: ',',
				cursor: 28,
				aborted: false,
				truncated: false,
				renamedHeaders: null
			}
		}
	},
	{
		description: "Using \\r\\n endings with \\n in header field uses \\r\\n linebreak",
		input: '"a\na",b\r\nc,d\r\ne,f\r\ng,h\r\ni,j',
		config: {},
		expected: {
			data: [['a\na', 'b'], ['c', 'd'], ['e', 'f'], ['g', 'h'], ['i', 'j']],
			errors: [],
			meta: {
				linebreak: '\r\n',
				delimiter: ',',
				cursor: 27,
				aborted: false,
				truncated: false,
				renamedHeaders: null
			}
		}
	},
	{
		description: "Using \\r\\n endings with \\n in header field with skip empty lines uses \\r\\n linebreak",
		input: '"a\na",b\r\nc,d\r\ne,f\r\ng,h\r\ni,j\r\n',
		config: {skipEmptyLines: true},
		expected: {
			data: [['a\na', 'b'], ['c', 'd'], ['e', 'f'], ['g', 'h'], ['i', 'j']],
			errors: [],
			meta: {
				linebreak: '\r\n',
				delimiter: ',',
				cursor: 29,
				aborted: false,
				truncated: false,
				renamedHeaders: null
			}
		}
	},
	{
		description: "Using \\n endings with \\r\\n in header field uses \\n linebreak",
		input: '"a\r\na",b\nc,d\ne,f\ng,h\ni,j',
		config: {},
		expected: {
			data: [['a\r\na', 'b'], ['c', 'd'], ['e', 'f'], ['g', 'h'], ['i', 'j']],
			errors: [],
			meta: {
				linebreak: '\n',
				delimiter: ',',
				cursor: 24,
				aborted: false,
				truncated: false,
				renamedHeaders: null
			}
		}
	},
	{
		description: "Using reserved regex character . as quote character",
		input: '.a\na.,b\r\nc,d\r\ne,f\r\ng,h\r\ni,j',
		config: { quoteChar: '.' },
		expected: {
			data: [['a\na', 'b'], ['c', 'd'], ['e', 'f'], ['g', 'h'], ['i', 'j']],
			errors: [],
			meta: {
				linebreak: '\r\n',
				delimiter: ',',
				cursor: 27,
				aborted: false,
				truncated: false,
				renamedHeaders: null
			}
		}
	},
	{
		description: "Using reserved regex character | as quote character",
		input: '|a\na|,b\r\nc,d\r\ne,f\r\ng,h\r\ni,j',
		config: { quoteChar: '|' },
		expected: {
			data: [['a\na', 'b'], ['c', 'd'], ['e', 'f'], ['g', 'h'], ['i', 'j']],
			errors: [],
			meta: {
				linebreak: '\r\n',
				delimiter: ',',
				cursor: 27,
				aborted: false,
				truncated: false,
				renamedHeaders: null
			}
		}
	},
	{
		description: "UTF-8 BOM encoded input is stripped from invisible BOM character",
		input: '\ufeffA,B\nX,Y',
		config: {},
		expected: {
			data: [['A', 'B'], ['X', 'Y']],
			errors: [],
		}
	},
	{
		description: "UTF-8 BOM encoded input with header produces column key stripped from invisible BOM character",
		input: '\ufeffA,B\nX,Y',
		config: { header: true },
		expected: {
			data: [{A: 'X', B: 'Y'}],
			errors: [],
		}
	},
	{
		description: "Parsing with skipEmptyLines set to 'greedy'",
		notes: "Must parse correctly without lines with no content",
		input: 'a,b\n\n,\nc,d\n , \n""," "\n	,	\n,,,,\n',
		config: { skipEmptyLines: 'greedy' },
		expected: {
			data: [['a', 'b'], ['c', 'd']],
			errors: []
		}
	},
	{
		description: "Parsing with skipEmptyLines set to 'greedy' with quotes and delimiters as content",
		notes: "Must include lines with escaped delimiters and quotes",
		input: 'a,b\n\n,\nc,d\n" , ",","\n""" """,""""""\n\n\n',
		config: { skipEmptyLines: 'greedy' },
		expected: {
			data: [['a', 'b'], ['c', 'd'], [' , ', ','], ['" "', '""']],
			errors: []
		}
	},
	{
		description: "Quoted fields with spaces between closing quote and next delimiter and contains delimiter",
		input: 'A,",B" ,C,D\nE,F,G,H',
		expected: {
			data: [['A', ',B', 'C', 'D'],['E', 'F', 'G', 'H']],
			errors: []
		}
	},
	{
		description: "Quoted fields with spaces between closing quote and newline and contains newline",
		input: 'a,b,"c\n" \nd,e,f',
		expected: {
			data: [['a', 'b', 'c\n'], ['d', 'e', 'f']],
			errors: []
		}
	},
	{
		description: "Skip First N number of lines , with header and 2 rows",
		input: 'a,b,c,d\n1,2,3,4',
		config: { header: true, skipFirstNLines: 1 },
		expected: {
			data: [],
			errors: []
		}
	},
	{
		description: "Skip First N number of lines , with header and 2 rows",
		input: 'to-be-ignored\na,b,c,d\n1,2,3,4',
		config: { header: true, skipFirstNLines: 1 },
		expected: {
			data: [{a: '1', b: '2', c: '3', d: '4'}],
			errors: []
		}
	},
	{
		description: "Skip First N number of lines , with header false",
		input: 'a,b,c,d\n1,2,3,4\n4,5,6,7',
		config: { header: false, skipFirstNLines: 1 },
		expected: {
			data: [['1','2','3','4'],['4','5','6','7']],
			errors: []
		}
	},
	{
		description: "Skip First N number of lines , with header false and skipFirstNLines as negative value",
		input: 'a,b,c,d\n1,2,3,4\n4,5,6,7',
		config: { header: false, skipFirstNLines: -2 },
		expected: {
			data: [['a','b','c','d'],['1','2','3','4'],['4','5','6','7']],
			errors: []
		}
	},
	{
		description: "Skip first 2 lines , with custom newline character",
		input: 'skip-this\rskip-this\r1,2,3,4',
		config: { header: false, skipFirstNLines: 2, newline: '\r' },
		expected: {
			data: [['1','2','3','4']],
			errors: []
		}
	},

];

describe('Parse Tests', function() {
	function generateTest(test) {
		(test.disabled ? it.skip : it)(test.description, function() {
			var actual = Papa.parse(test.input, test.config);
			// allows for testing the meta object if present in the test
			if (test.expected.meta) {
				assert.deepEqual(actual.meta, test.expected.meta);
			}
			assert.deepEqual(actual.errors, test.expected.errors);
			assert.deepEqual(actual.data, test.expected.data);
		});
	}

	for (var i = 0; i < PARSE_TESTS.length; i++) {
		generateTest(PARSE_TESTS[i]);
	}

	// Custom test for Issue 1024 - renamedHeaders regression test
	it('Issue 1024: renamedHeaders returned for simple duplicate headers (regression test)', function() {
		var result = Papa.parse('Column,Column\n1-1,1-2\n2-1,2-2\n3-1,3-2', { header: true });

		// Test data structure
		assert.deepEqual(result.data, [
			{Column: '1-1', Column_1: '1-2'},
			{Column: '2-1', Column_1: '2-2'},
			{Column: '3-1', Column_1: '3-2'}
		]);

		// Test errors
		assert.deepEqual(result.errors, []);

		// Test that renamedHeaders is present and correct
		assert.isNotNull(result.meta.renamedHeaders, 'renamedHeaders should not be null');
		assert.isObject(result.meta.renamedHeaders, 'renamedHeaders should be an object');
		assert.deepEqual(result.meta.renamedHeaders, {Column_1: 'Column'}, 'renamedHeaders should contain the renamed header mapping');
	});
});



// Tests for Papa.parse() that involve asynchronous operation
var PARSE_ASYNC_TESTS = [
	{
		description: "Simple download",
		input: BASE_PATH + "sample.csv",
		config: {
			download: true
		},
		disabled: !XHR_ENABLED,
		expected: {
			data: [['A','B','C'],['X','Y','Z']],
			errors: []
		}
	}
];

describe('Parse Async Tests', function() {
	function generateTest(test) {
		(test.disabled ? it.skip : it)(test.description, function(done) {
			var config = test.config;

			config.complete = function(actual) {
				assert.deepEqual(actual.errors, test.expected.errors);
				assert.deepEqual(actual.data, test.expected.data);
				done();
			};

			config.error = function(err) {
				throw err;
			};

			Papa.parse(test.input, config);
		});
	}

	for (var i = 0; i < PARSE_ASYNC_TESTS.length; i++) {
		generateTest(PARSE_ASYNC_TESTS[i]);
	}
});


var CUSTOM_TESTS = [
	{
		description: "Complete is called with all results if neither step nor chunk is defined",
		expected: [['A', 'b', 'c'], ['d', 'E', 'f'], ['G', 'h', 'i']],
		run: function(callback) {
			Papa.parse('A,b,c\nd,E,f\nG,h,i', {
				chunkSize: 3,
				complete: function(response) {
					callback(response.data);
				}
			});
		}
	},
	{
		description: "Step is called for each row",
		expected: 2,
		run: function(callback) {
			var callCount = 0;
			Papa.parse('A,b,c\nd,E,f', {
				step: function() {
					callCount++;
				},
				complete: function() {
					callback(callCount);
				}
			});
		}
	},
	{
		description: "Data is correctly parsed with steps",
		expected: [['A', 'b', 'c'], ['d', 'E', 'f']],
		run: function(callback) {
			var data = [];
			Papa.parse('A,b,c\nd,E,f', {
				step: function(results) {
					data.push(results.data);
				},
				complete: function() {
					callback(data);
				}
			});
		}
	},
	{
		description: "Data is correctly parsed with steps (headers)",
		expected: [{One: 'A', Two: 'b', Three: 'c'}, {One: 'd', Two: 'E', Three: 'f'}],
		run: function(callback) {
			var data = [];
			Papa.parse('One,Two,Three\nA,b,c\nd,E,f', {
				header: true,
				step: function(results) {
					data.push(results.data);
				},
				complete: function() {
					callback(data);
				}
			});
		}
	},
	{
		description: "Data is correctly parsed with steps when skipping empty lines",
		expected: [['A', 'b', 'c'], ['d', 'E', 'f']],
		run: function(callback) {
			var data = [];
			Papa.parse('A,b,c\n\nd,E,f', {
				skipEmptyLines: true,
				step: function(results) {
					data.push(results.data);
				},
				complete: function() {
					callback(data);
				}
			});
		}
	},
	{
		description: "Data is correctly parsed with steps when there are empty values",
		expected: [{A: 'a', B: 'b', C: 'c', D: 'd'}, {A: 'a', B: '', C: '', D: ''}],
		run: function(callback) {
			var data = [];
			Papa.parse('A,B,C,D\na,b,c,d\na,,,', {
				header: true,
				step: function(results) {
					data.push(results.data);
				},
				complete: function() {
					callback(data);
				}
			});
		}
	},
	{
		description: "Step is called with the contents of the row",
		expected: ['A', 'b', 'c'],
		run: function(callback) {
			Papa.parse('A,b,c', {
				step: function(response) {
					callback(response.data);
				}
			});
		}
	},
	{
		description: "Step is called with the last cursor position",
		expected: [6, 12, 17],
		run: function(callback) {
			var updates = [];
			Papa.parse('A,b,c\nd,E,f\nG,h,i', {
				step: function(response) {
					updates.push(response.meta.cursor);
				},
				complete: function() {
					callback(updates);
				}
			});
		}
	},
	{
		description: "Step exposes cursor for downloads",
		expected: [129,	287, 452, 595, 727, 865, 1031, 1209],
		disabled: !XHR_ENABLED,
		run: function(callback) {
			var updates = [];
			Papa.parse(BASE_PATH + "long-sample.csv", {
				download: true,
				step: function(response) {
					updates.push(response.meta.cursor);
				},
				complete: function() {
					callback(updates);
				}
			});
		}
	},
	{
		description: "Step exposes cursor for chunked downloads",
		expected: [129,	287, 452, 595, 727, 865, 1031, 1209],
		disabled: !XHR_ENABLED,
		run: function(callback) {
			var updates = [];
			Papa.parse(BASE_PATH + "long-sample.csv", {
				download: true,
				chunkSize: 500,
				step: function(response) {
					updates.push(response.meta.cursor);
				},
				complete: function() {
					callback(updates);
				}
			});
		}
	},
	{
		description: "Chunk is called for each chunk",
		expected: [3, 3, 2],
		disabled: !XHR_ENABLED,
		run: function(callback) {
			var updates = [];
			Papa.parse(BASE_PATH + "long-sample.csv", {
				download: true,
				chunkSize: 500,
				chunk: function(response) {
					updates.push(response.data.length);
				},
				complete: function() {
					callback(updates);
				}
			});
		}
	},
	{
		description: "Chunk is called with cursor position",
		expected: [452, 865, 1209],
		disabled: !XHR_ENABLED,
		run: function(callback) {
			var updates = [];
			Papa.parse(BASE_PATH + "long-sample.csv", {
				download: true,
				chunkSize: 500,
				chunk: function(response) {
					updates.push(response.meta.cursor);
				},
				complete: function() {
					callback(updates);
				}
			});
		}
	},
	{
		description: "Chunk functions can abort parsing",
		expected: [
			[['A', 'b', 'c']]
		],
		run: function(callback) {
			var updates = [];
			Papa.parse('A,b,c\nd,E,f\nG,h,i', {
				chunkSize: 1,
				chunk: function(response, handle) {
					if (response.data.length) {
						updates.push(response.data);
						handle.abort();
					}
				},
				complete: function(response) {
					callback(updates);
				}
			});
		}
	},
	{
		description: "Quoted line breaks near chunk boundaries are handled",
		expected: [['A', 'B', 'C'], ['X', 'Y\n1\n2\n3', 'Z']],
		run: function(callback) {
			var updates = [];
			Papa.parse('A,B,C\nX,"Y\n1\n2\n3",Z', {
				chunkSize: 3,
				step: function(response) {
					updates.push(response.data);
				},
				complete: function() {
					callback(updates);
				}
			});
		}
	},
	{
		description: "Step functions can abort parsing",
		expected: [['A', 'b', 'c']],
		run: function(callback) {
			var updates = [];
			Papa.parse('A,b,c\nd,E,f\nG,h,i', {
				step: function(response, handle) {
					updates.push(response.data);
					handle.abort();
					callback(updates);
				},
				chunkSize: 6
			});
		}
	},
	{
		description: "Complete is called after aborting",
		expected: true,
		run: function(callback) {
			Papa.parse('A,b,c\nd,E,f\nG,h,i', {
				step: function(response, handle) {
					handle.abort();
				},
				chunkSize: 6,
				complete: function(response) {
					callback(response.meta.aborted);
				}
			});
		}
	},
	{
		description: "beforeFirstChunk manipulates only first chunk",
		expected: 7,
		disabled: !XHR_ENABLED,
		run: function(callback) {
			var updates = 0;
			Papa.parse(BASE_PATH + "long-sample.csv", {
				download: true,
				chunkSize: 500,
				beforeFirstChunk: function(chunk) {
					return chunk.replace(/.*?\n/, '');
				},
				step: function(response) {
					updates++;
				},
				complete: function() {
					callback(updates);
				}
			});
		}
	},
	{
		description: "First chunk not modified if beforeFirstChunk returns nothing",
		expected: 8,
		disabled: !XHR_ENABLED,
		run: function(callback) {
			var updates = 0;
			Papa.parse(BASE_PATH + "long-sample.csv", {
				download: true,
				chunkSize: 500,
				beforeFirstChunk: function(chunk) {
				},
				step: function(response) {
					updates++;
				},
				complete: function() {
					callback(updates);
				}
			});
		}
	},
	{
		description: "Should correctly guess custom delimiter when passed delimiters to guess.",
		expected: "~",
		run: function(callback) {
			var results = Papa.parse('"A"~"B"~"C"~"D"', {
				delimitersToGuess: ['~', '@', '%']
			});
			callback(results.meta.delimiter);
		}
	},
	{
		description: "Should still correctly guess default delimiters when delimiters to guess are not given.",
		expected: ",",
		run: function(callback) {
			var results = Papa.parse('"A","B","C","D"');
			callback(results.meta.delimiter);
		}
	},
	{
		description: "Data is correctly parsed with chunks and duplicated headers",
		expected: [{h0: 'a', h1: 'a'}, {h0: 'b', h1: 'b'}],
		run: function(callback) {
			var data = [];
			Papa.parse('h0,h1\na,a\nb,b', {
				header: true,
				chunkSize: 10,
				chunk: function(results) {
					data.push(results.data[0]);
				},
				complete: function() {
					callback(data);
				}
			});
		}
	},
];

describe('Custom Tests', function() {
	function generateTest(test) {
		(test.disabled ? it.skip : it)(test.description, function(done) {
			if(test.timeout) {
				this.timeout(test.timeout);
			}
			test.run(function(actual) {
				assert.deepEqual(actual, test.expected);
				done();
			});
		});
	}

	for (var i = 0; i < CUSTOM_TESTS.length; i++) {
		generateTest(CUSTOM_TESTS[i]);
	}
});

(typeof window !== "undefined" ? describe : describe.skip)("Browser Tests", () => {
	it("When parsing synchronously inside a web-worker not owned by PapaParse we should not invoke postMessage", async() => {
		// Arrange
		const papaParseScriptPath = new URL("../papaparse.js", window.document.baseURI).href;

		// Define our custom web-worker that loads PapaParse and executes a synchronous parse
		const blob = new Blob([
			`
				importScripts('${papaParseScriptPath}');

				self.addEventListener("message", function(event) {
					if (event.data === "ExecuteParse") {
						// Perform our synchronous parse, as requested
						const results = Papa.parse('x\\ny\\n');
						postMessage({type: "ParseExecutedSuccessfully", results});
					} else {
						// Otherwise, send whatever we received back. We shouldn't be hitting this (!) If we're reached
						// this it means PapaParse thinks it is running inside a web-worker that it owns
						postMessage(event.data);
					}
				});
				`
		], {type: 'text/javascript'});

		const blobURL = window.URL.createObjectURL(blob);
		const webWorker = new Worker(blobURL);

		const receiveMessagePromise = new Promise((resolve, reject) => {
			webWorker.addEventListener("message", (event) => {
				if (event.data.type === "ParseExecutedSuccessfully") {
					resolve(event.data);
				} else {
					const error = new Error(`Received unexpected message: ${JSON.stringify(event.data, null, 2)}`);
					error.data = event.data;
					reject(error);
				}
			});
		});

		// Act
		webWorker.postMessage("ExecuteParse");
		const webWorkerMessage = await receiveMessagePromise;

		// Assert
		assert.equal("ParseExecutedSuccessfully", webWorkerMessage.type);
		assert.equal(3, webWorkerMessage.results.data.length);
	});
});
