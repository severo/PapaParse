/// <reference types="node" />
/* copied from
 * https://github.com/DefinitelyTyped/DefinitelyTyped/blob/936968bd3492ce9296d465869dff30bd75999143/types/papaparse/index.d.ts
 * and adapted to add option offset
 */

export as namespace Papa;

export {}; // Don't export all declarations!

/**
 * Parse string or remote files
 * @param source the string to be parsed or the URL to the file to download.
 * @param config a config object.
 * @returns Doesn't return anything. Results are provided asynchronously to a callback function.
 */
export function parse(
  source: string,
  config: ParseAsyncConfig & (ParseStringConfig | ParseRemoteConfig)
): void;

/**
 * Read-Only Properties
 */

/** An array of characters that are not allowed as delimiters. `\r`, `\n`, `"`, `\ufeff` */
export const BAD_DELIMITERS: readonly string[];

/** The true delimiter. Invisible. ASCII code 30. Should be doing the job we strangely rely upon commas and tabs for. */
export const RECORD_SEP: "\x1E";

/** Also sometimes used as a delimiting character. ASCII code 31. */
export const UNIT_SEP: "\x1F";

/**
 * Configurable Properties
 */

/**
 * The size in bytes of each file chunk. Used when downloading files from remote locations. Default 5 MB.
 * @default 5242880
 */
export let RemoteChunkSize: number;

/**
 * The delimiter used when it is left unspecified and cannot be detected automatically. Default is comma.
 * @default ','
 */
export let DefaultDelimiter: string;

/**
 * On Papa there are actually more classes exposed
 * but none of them are officially documented
 * Since we can interact with the Parser from one of the callbacks
 * I have included the API for this class.
 */
export class Parser {
  constructor(config: ParseAsyncConfig);

  parse(input: string, baseIndex: number, ignoreLastRow: boolean): any;

  // Sets the abort flag
  abort(): void;

  // Gets the cursor position
  getCharIndex(): number;
}

export interface ParseAsyncConfig {
  /**
   * To stream the input, define a callback function.
   * Streaming is necessary for large files which would otherwise crash the browser.
   * You can call parser.abort() to abort parsing.
   * Mandatory
   */
  step(results: ParseResult, parser: Parser): void;
  /**
   * The delimiting character.
   * Leave blank to auto-detect from a list of most common delimiters, or any values passed in through `delimitersToGuess`.
   * It can be a string or a function.
   * If a string, it can be of any length (so multi-character delimiters are supported).
   * If a function, it must accept the input as first parameter and it must return a string which will be used as delimiter.
   * In both cases it cannot be found in `Papa.BAD_DELIMITERS`.
   * @default // auto-detect
   */
  delimiter?: string | ((input: string) => string) | undefined;
  /**
   * The newline sequence. Leave blank to auto-detect. Must be one of `\r`, `\n`, or `\r\n`.
   * @default // auto-detect
   */
  newline?: "\r" | "\n" | "\r\n" | undefined;
  /**
   * The character used to quote fields. The quoting of all fields is not mandatory. Any field which is not quoted will correctly read.
   * @default '"'
   */
  quoteChar?: string | undefined;
  /**
   * The character used to escape the quote character within a field.
   * If not set, this option will default to the value of `quoteChar`,
   * meaning that the default escaping of quote character within a quoted field is using the quote character two times.
   * (e.g. `"column with ""quotes"" in text"`)
   * @default '"'
   */
  escapeChar?: string | undefined;
  /**
   * If `true`, the first row of parsed data will be interpreted as field names.
   * An array of field names will be returned in meta, and each row of data will be an object of values keyed by field name instead of a simple array.
   * Rows with a different number of fields from the header row will produce an error.
   * Warning: Duplicate field names will overwrite values in previous fields having the same name.
   * @default false
   */
  header?: boolean | undefined;
  /**
   * A string that indicates a comment (for example, "#" or "//").
   * When Papa encounters a line starting with this string, it will skip the line.
   * @default false
   */
  comments?: false | string | undefined;
  /**
   * If `true`, lines that are completely empty (those which evaluate to an empty string) will be skipped.
   * If set to `'greedy'`, lines that don't have any content (those which have only whitespace after parsing) will also be skipped.
   * @default false
   */
  skipEmptyLines?: boolean | "greedy" | undefined;
  /**
   * An array of delimiters to guess from if the delimiter option is not set.
   * @default [',', '\t', '|', ';', Papa.RECORD_SEP, Papa.UNIT_SEP]
   */
  delimitersToGuess?: string[] | undefined;
  /**
   * Overrides `Papa.RemoteChunkSize`.
   * For string streamer, it's the size in characters of each chunk to be processed, not the size in bytes.
   */
  chunkSize?: number | undefined;
  /**
   * A callback to execute if the streamer encounters an error.
   * The function is passed one argument: the error.
   */
  error?(error: Error): void;
  /**
   * The callback to execute when parsing is complete.
   */
  complete?(): void;
}

interface ParseStringConfig {
  /**
   * This indicates that the string you passed as the first argument to `parse()`
   * is the actual CSV text to parse.
   */
  download?: false | undefined;
}

// Remote parsing has options for the backing web request
interface ParseRemoteConfig {
  /**
   * This indicates that the string you passed as the first argument to `parse()`
   * is actually a URL from which to download a file and parse its contents.
   */
  download: true;
  /**
   * If defined, should be an object that describes the headers.
   * @example { 'Authorization': 'token 123345678901234567890' }
   * @default undefined
   */
  downloadRequestHeaders?: { [headerName: string]: string } | undefined;
  /**
   * Use POST request on the URL of the download option. The value passed will be set as the body of the request.
   * @default undefined
   */
  downloadRequestBody?:
    | Blob
    | BufferSource
    | FormData
    | URLSearchParams
    | string
    | undefined;
  /**
   * A boolean value passed directly into XMLHttpRequest's "withCredentials" property.
   * @default undefined
   */
  withCredentials?: boolean | undefined;
  /**
   * If defined and greater than 0, the first chunk will start at this byte offset in the remote file
   * instead of the beginning of the file.
   */
  offset?: number | undefined;
}

/** Error structure */
export interface ParseError {
  /** A generalization of the error */
  type: "Quotes" | "Delimiter" | "FieldMismatch";
  /** Standardized error code */
  code:
    | "MissingQuotes"
    | "UndetectableDelimiter"
    | "TooFewFields"
    | "TooManyFields"
    | "InvalidQuotes";
  /** Human-readable details */
  message: string;
  /** Row index of parsed data where error is */
  row?: number | undefined;
  /** Index within the row where error is */
  index?: number | undefined;
}

export interface ParseMeta {
  /** Delimiter used */
  delimiter: string;
  /** Line break sequence used */
  linebreak: string;
  /** Whether process was aborted */
  aborted: boolean;
  /** Array of field names */
  fields?: string[] | undefined;
  /** Character position after the parsed row */
  cursor: number;
  /** Byte position where parsing started */
  firstByte: number;
  /** Number of bytes parsed, including line breaks, BOM, spaces, etc. */
  numBytes: number;
}

/**
 * A parse result always contains three objects: data, errors, and meta.
 * Data and errors are arrays, and meta is an object. In the step callback, the data array will only contain one element.
 */
export interface ParseResult {
  /**
   * In the step callback, the data array will only contain one element.
   */
  data: string[] | { [key: string]: string }[];
  /** an array of errors. */
  errors: ParseError[];
  /**
   * contains extra information about the parse, such as delimiter used,
   * the newline sequence, whether the process was aborted, etc.
   * Properties in this object are not guaranteed to exist in all situations.
   */
  meta: ParseMeta;
}

// TODO(SL): replace with an async iterator?
