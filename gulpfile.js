var gulp = require('gulp');
var jshint = require('gulp-jshint');
var less = require('gulp-less');

gulp.task('less', function() {
    return gulp.src('flock.js')
        .pipe(jshint())
        .pipe(jshint.reporter('default'));
});

gulp.task('lint', function() {
    return gulp.src('static/**/*.less')
        .pipe(less())
        .pipe(gulp.dest('dist/'));
});

gulp.task('default', ['less', 'lint']);