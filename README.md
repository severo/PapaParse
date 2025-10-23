Parse CSV with JavaScript
========================================

This repository is a fork of Papaparse which adds:
- `offset` configuration option for the parse method, only for the streaming mode, which sets the byte offset of the first chunk to parse. This is useful when resuming a paused parse from a specific byte offset in the file or remote URL.

---

Papa Parse is the fastest in-browser CSV (or delimited text) parser for JavaScript. It is reliable and correct according to [RFC 4180](https://tools.ietf.org/html/rfc4180), and it comes with these features:

- Easy to use
- Parse CSV files directly (over the network)
- Stream large files via HTTP
- Auto-detect delimiter
- Header row support
- Abort
- One of the only parsers that correctly handles line-breaks and quotations

Papa Parse has **no dependencies**.

Install
-------

papaparse is available on [npm](https://www.npmjs.com/package/papaparse). It
can be installed with the following command:
```shell
npm install papaparse
```

If you don't want to use npm, [papaparse.min.js](https://unpkg.com/papaparse@latest/papaparse.min.js) can be downloaded to your project source.

Usage
-----
```js
import Papa from 'papaparse';

Papa.parse(url, config);
```

Homepage & Demo
----------------

- [Homepage](https://www.papaparse.com)
- [Demo](https://www.papaparse.com/demo)

To learn how to use Papa Parse:

- [Documentation](https://www.papaparse.com/docs)

The website is hosted on [Github Pages](https://pages.github.com/). Its content is also included in the docs folder of this repository. If you want to contribute on it just clone the master of this repository and open a pull request.


Get Started
-----------

For usage instructions, see the [homepage](https://www.papaparse.com) and, for more detail, the [documentation](https://www.papaparse.com/docs).

Tests
-----

Papa Parse is under test. Download this repository, run `npm install`, then `npm test` to run the tests.

Contributing
------------

To discuss a new feature or ask a question, open an issue. To fix a bug, submit a pull request to be credited with the [contributors](https://github.com/mholt/PapaParse/graphs/contributors)! Remember, a pull request, *with test*, is best. You may also discuss on Twitter with [#PapaParse](https://twitter.com/search?q=%23PapaParse&src=typd&f=realtime) or directly to me, [@mholt6](https://twitter.com/mholt6).

If you contribute a patch, ensure the tests suite is running correctly. We run continuous integration on each pull request and will not accept a patch that breaks the tests.
