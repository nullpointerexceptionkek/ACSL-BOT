const {VM} = require("vm2");
const axios = require("axios");
const path = require("path");
const fs = require("fs");
const util = require("util");
const sequelize = require("../../index.js");
const Level = sequelize.Level;
const config = require("../../../config.json");
const Buffer = require("buffer").Buffer;

const languageIdMap = {
  js: 63,
  java: 62,
  cpp: 54,
  py: 71,
};

module.exports = async (client, message) => {
  if (message.author.bot) return;
  if (
    !(
      message.content.toLowerCase().startsWith("!submit") &&
      message.channel.type === 1
    )
  )
    return;

  let questionData = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "..", "..", "..", "currentQuestion.json"),
      "utf-8"
    )
  );
  if (!questionData)
    return message.reply(
      "No question is currently active. Please wait for a question to be generated."
    );
  //check if user has already submitted
  if (questionData.successfulSubmissions.includes(message.author.id)) {
    return message.reply("You have already submitted a correct solution.");
  }

  const codeBlock = message.content.match(/```(\w+)\n([\s\S]*?)```/);
  if (!codeBlock) {
    return message.reply(
      "Invalid format. Code must be surrounded by triple backticks and the language name."
    );
  }

  const language = codeBlock[1];
  const code = Buffer.from(codeBlock[2]).toString("base64");

  if (!Object.keys(languageIdMap).includes(language)) {
    return message.reply(
      `Unsupported language. Supported languages are ${Object.keys(
        languageIdMap
      ).join(", ")}`
    );
  }

  const submissionData = {
    source_code: code,
    language_id: languageIdMap[language],
    stdin: Buffer.from(
      questionData.testCases
        .map((testCase) => testCase.input.toString())
        .join("\n")
    ).toString("base64"),
    expected_output: Buffer.from(
      questionData.testCases
        .map((testCase) => testCase.expected.toString())
        .join("\n")
    ).toString("base64"),
    base64_encoded: true,
  };

  const options = {
    method: "POST",
    url: "https://judge0-ce.p.rapidapi.com/submissions?base64_encoded=true",
    headers: {
      "X-RapidAPI-Key": process.env.JudgeAPI,
      "X-RapidAPI-Host": "judge0-ce.p.rapidapi.com",
      "Content-Type": "application/json",
    },
    data: submissionData,
  };

  try {
    message.reply("Awaiting for the grading server... this may take a while.");
    const response = await axios.request(options);

    //console.log(response.data);
    try {
      const response = await axios.request(options);
      const {token} = response.data;

      let resultData = null;
      do {        const resultResponse = await axios.request({
          method: "GET",
          url: `https://judge0-ce.p.rapidapi.com/submissions/${token}?base64_encoded=true`,
          headers: {
            "X-RapidAPI-Key": process.env.JudgeAPI,
            "X-RapidAPI-Host": "judge0-ce.p.rapidapi.com",
          },
        });
        //console.log(resultResponse.data);

        resultData = resultResponse.data;

        if (resultData.status.id !== 2) {
          // Not processing anymore
          break;
        }

        // Wait a bit before checking again
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } while (true);

      if (resultData.status.id == 3) {
        message.reply(`Correct solution! You have earned ${questionData.points} points.`);
        let level = await Level.findOne({ where: { userId: message.author.id, guildId: config.testServer } });
            //console.log(level);
            if (level) {
                level.level += questionData.points;
                // Update database
                await level.save().catch((e) => {
                    console.log(`Error saving updated level ${e}`);
                    return;
                });
            } else {
                level = await Level.create({
                    userId: message.author.id,
                    guildId: message.guild.id,
                    xp: 0,
                    level: questionData.points
                });
            }
            questionData.successfulSubmissions.push(message.author.id);
            fs.writeFileSync(path.join(__dirname, '..',"..", '..', 'currentQuestion.json'), JSON.stringify(questionData));
      } else{
        message.reply(
          `Result:\`\`\` ${resultData.status.description} \`\`\``
        );
        //console.log(resultData.compile_output);
        if (resultData.compile_output) {
          message.reply(
            `Compiler output: \`\`\`${Buffer.from(
              resultData.compile_output,
              "base64"
            ).toString("utf8")}\`\`\``
          );
        }
        // if (resultData.stderr) {
        //   message.reply(
        //     `Standard error: \`\`\`${Buffer.from(
        //       resultData.stderr,
        //       "base64"
        //     ).toString("utf8")}\`\`\``
        //   );
        // }
        // if(!resultData.id === 4) return;
        if (resultData.stdout) {
          const stdout = Buffer.from(resultData.stdout, "base64").toString(
            "utf8"
          );
          const result = stdout
            .split("\n")
            .map((item) => item.trim() === "true");

          let passed = 0;
          let total = questionData.testCases.length;
          for (let i = 0; i < questionData.testCases.length; i++) {
            //console.log(result[i], questionData.testCases[i].expected);
            if (result[i] == questionData.testCases[i].expected) {
              passed++;
            }
          }

          //message.reply(`Your Standard output: \`\`\`${stdout}\`\`\``);
          message.reply(
            `You have passed ${passed} out of ${total} test case(s).`
          );
        }
      }
    } catch (err) {
      message.reply("An error occurred while submitting your solution.");
      console.log(err);
    }
  } catch (err) {
    console.error(err);
    message.reply("An error occurred while submitting your solution.");
  }
};
