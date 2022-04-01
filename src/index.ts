import { Provider } from "@ethersproject/abstract-provider";
import { Wallet } from "ethers";
import { FakeBusters } from "./FakeBusters";
import { Outcome } from "./types/outcome";
import { Vote } from "./types/vote";
import { getProvider } from "./utils/eth";

require("dotenv").config();

// let keys = require("fs").readFileSync("secrets.txt", "utf-8").split(/\r?\n/);

const news: Array<string> = [""];

// correct evaluation of each piece of news
const newsRealEvaluation: Map<string, Outcome> = new Map([
  // [newsUrl, evaluation]
]);

// evaluations given by the system
// null = NO_DECISION
type SystemOutcome = Outcome | null;
const systemEvaluation: Map<string, SystemOutcome> = new Map([]);

// map: news url => list of votes for that news
const votes: Map<string, Array<Vote>> = new Map([]);
// TODO: parse of form results to fill this map

const init = async () => {
  // provider used to connect to the considered network
  const provider: Provider = getProvider();

  // object used to connect to the smart contract
  // if no address is passed, a new contract is created
  const contract: FakeBusters = await FakeBusters.build(provider);

  // submitter and expert wallets
  const submitter = new Wallet(process.env.SUBMITTER_PRIVATE_KEY!, provider);
  const expert = new Wallet(process.env.EXPERT_PRIVATE_KEY!, provider);

  news.forEach(async (currentNews: string) => {
    // 1. submit
    const submitResult = await contract.submitNews(currentNews, submitter);

    // 2. expert
    const newsId = (await contract.getActivePolls())[0];
    const certFee = await contract.getMinCertFee();
    const certificationResult = await contract.cerify(
      expert,
      newsId,
      certFee,
      newsRealEvaluation.get(currentNews)! // the expert certify in the correct way
    );

    // 3. buster
    const votingFee = await contract.getMaxVotingFee();
    const currentVotes = votes.get(currentNews)!;

    currentVotes.forEach(async (vote: Vote) => {
      const voter = new Wallet(vote.account, provider);

      // first, request vote
      const requestVoteResult = await contract.requestVote(voter, votingFee);

      // second, actually vote
      const voteResult = await contract.vote(voter, vote.answer);
    });
    // ===== VOTING FOR THE CURRENT PIECE OF NEWS ENDS =====

    // 4. withdraw
    currentVotes.forEach(async (vote: Vote) => {
      /* withdraw only if one of the following statements is true: 
        - the considered piece of news is evaluated as null (NO_DECISION) by the system 
        - the user has voted correctly
      */
      if (
        systemEvaluation.get(currentNews) == null ||
        vote.answer == newsRealEvaluation.get(currentNews)
      ) {
        const voter = new Wallet(vote.account, provider);
        const withdrawResult = await contract.withdraw(voter, newsId);
      }
    });
  });
};
