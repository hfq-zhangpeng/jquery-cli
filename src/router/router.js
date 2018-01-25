import App from 'c';
import $ from 'jquery';

console.log('router ready');

App.router('/test1', ctx => {
    $('#output').html('this is test1');
});

App.router('/test2', ctx => {
    $('#output').html('this is test2');
});

App.router('/test3', ctx => {
    $('#output').html('this is test3');
});

App.init();

setTimeout(function() {
    App.page.go('/test2', 'this is title');
}, 3000);