import assert from 'assert';
import Handlebars from 'handlebars';

console.log('Testing built Handlebars with Node version ' + process.version);

var template = Handlebars.compile('Author: {{author}}');
var output = template({ author: 'Yehuda' });
assert.strictEqual(output, 'Author: Yehuda');

console.log('Success');
