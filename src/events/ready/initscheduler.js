const fs = require('fs');
const path = require("path");
const cron = require('node-cron');
const getAllFiles = require("../../utils/getAllFiles");
const config = require('../../../config.json');
const sendMessage = require('../../utils/breakMessage');


function getRandomInt(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
  
  const generateQuestion = (client) => {
    const questionFilesEasy = getAllFiles(path.join(__dirname, '..', '..', 'daily-programming', 'questions', 'simple'));
    const questionFilesMid = getAllFiles(path.join(__dirname, '..', '..', 'daily-programming', 'questions', 'mid'));

    let randomQuestionFile;
    //select from a random question file
    if(getRandomInt(0, 1) == 0) {
        const randomIndex = Math.floor(Math.random() * questionFilesMid.length);
        randomQuestionFile = questionFilesMid[randomIndex];
    } else {
        const randomIndex = Math.floor(Math.random() * questionFilesEasy.length);
        randomQuestionFile = questionFilesEasy[randomIndex];
    }

    const questionData = require(randomQuestionFile);
    questionData.successfulSubmissions = [];
    const channel = client.channels.cache.get(config.questionsChannel);
    if (channel) {
        const message =
            `<@&${config.pingRoles}> \n` +
            `**Question:** ${questionData.name}\n` +
            `**Points:** ${questionData.points}\n` +
            `**Supported Languages:** ${questionData.lang.map(item => `${item.lang} (time: ${item.time})`).join(', ')}\n` +
            `**Difficulty:** ${questionData.difficulty}\n` +
            `**Instructions:** ${questionData.instruction}\n`;
        sendMessage(channel, message);
    } else {
        console.error(`Could not find channel with ID: ${config.questionsChannel}`);
    }

    // Store the current question data for submission checking
    fs.writeFileSync(path.join(__dirname, '..',"..", '..', 'currentQuestion.json'), JSON.stringify(questionData));
}



module.exports = (client) => {
    //generateQuestion(client);
    cron.schedule('0 4 * * 1', () => { //run at 4am every Sunday
        generateQuestion(client);
    });    
};
