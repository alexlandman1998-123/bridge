// Loaded only by the optional management view. No commands or transaction writes.
import { buildAttorneyMatterWorkspace, buildAttorneyMatterWorkspaceFromSnapshot } from '../../services/attorneyMatterWorkspace';
import { getAttorneyOperationalWorkspaceData } from '../../services/attorneyOperations';
import { getAttorneyMatterListSnapshot } from '../../services/attorneyMatterListSnapshotService';
import { getAttorneyMatterSnapshotRolloutStatus } from '../../services/attorneyMatterSnapshotRolloutService';
import { conveyancingRegisterRows } from './legalFirmOverviewModel';
export async function readConveyancingRegister({firmId,userId,page=1,search='',filters={}}) {
  const options={firmId,userId,view:'all',page,pageSize:20,search,filters};
  const rollout=await getAttorneyMatterSnapshotRolloutStatus(firmId);
  if(rollout.enabled) {
    const snapshot=await getAttorneyMatterListSnapshot(options);
    // Same canonical-contract/property guard as the current Attorney Matters page.
    if(snapshot?.contract==='arch9-attorney-matter-list-snapshot-v2' && snapshot.rows?.every(row=>row.workflowProgress?.canonical) && !(snapshot.rows.length && snapshot.rows.every(row=>String(row.propertyLabel||'').trim().toLowerCase()==='property pending'))) {
      return conveyancingRegisterRows(buildAttorneyMatterWorkspaceFromSnapshot(snapshot,options),firmId);
    }
  }
  // Existing reader's explicit force option rechecks assignments/roles instead of serving an older cached scope.
  const operational=await getAttorneyOperationalWorkspaceData(firmId,userId,{force:true});
  const workspace=buildAttorneyMatterWorkspace(operational,options);
  if(workspace.firm?.id!==firmId || workspace.currentUser?.id!==userId) throw new Error('Conveyancing access could not be verified');
  return conveyancingRegisterRows(workspace,firmId);
}
