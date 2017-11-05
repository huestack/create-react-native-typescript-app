import * as chalk from 'chalk';

class Message {
    error(data) {
        console.error(chalk.default.red(data));
    };

    warn(data) {
        console.error(chalk.default.yellow(data));
    }

    info(data) {
        console.log(chalk.default.white(data));
    }

    success(data) {
        console.log(chalk.default.green(data));
    }
}

export default new Message();