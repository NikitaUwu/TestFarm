import {getWorkflowMetadata,sleep} from 'workflow';
import {boot,runStage,researchToolStep,runTrial,finish,dispatchFollowing,prepareTrials,buildMvpStep,persistArtifacts} from './workflow-steps';

export async function researchIdeaWorkflow(jobId:string,launchToken:string){
 'use workflow';
 const workflowId=getWorkflowMetadata().workflowRunId;
 const state=await boot(jobId,launchToken,workflowId);if(!state)return;
 try{
  if(state.kind==='mvp')await buildMvpStep(jobId,launchToken);
  else{
   await runStage(jobId,launchToken,'analyzeIdea');
   await runStage(jobId,launchToken,'analyzeAudience');
   for(let i=0;i<state.webActions;i++){if(!await researchToolStep(jobId,launchToken,i))break;await sleep('1s');}
   for(const stage of ['researchMarketAndEvidence','buildHypotheses','proposeVariants','prepareBaseline'])await runStage(jobId,launchToken,stage);
   const work=await prepareTrials(jobId,launchToken);
   for(const trial of work)await runTrial(jobId,launchToken,trial);
   for(const stage of ['calculateEffect','buildScenarios','criticalAssessment','buildReport'])await runStage(jobId,launchToken,stage);
   await persistArtifacts(jobId,launchToken);
  }
  await finish(jobId,launchToken,'completed');
 }catch{await finish(jobId,launchToken,'failed');}
 await dispatchFollowing();
}
