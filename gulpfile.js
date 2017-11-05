var gulp = require("gulp");
var babel = require("gulp-babel");

gulp.task("assets", function() {
    return gulp.src(["./src/assets/*.*"])
        .pipe(gulp.dest("./dist/assets"))
});

gulp.task("default", ["assets"], function () {
    return gulp.src("./src/*.js")
        .pipe(babel())
        .pipe(gulp.dest("./dist"));
});