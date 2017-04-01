import RingCentral from 'ringcentral-ts';
import ExtensionInfo from 'ringcentral-ts/definitions/ExtensionInfo';
import redis from './redis';
import Glip, { GlipMessage } from './Glip';
import config from './config';
import RedisTokenStore from './RedisTokenStore';

let glip: Glip;
let rcClients: { [glipUserId: string]: RingCentral } = {};
let rcExtensions: { [glipUserId: string]: ExtensionInfo } = {};

/**
 * Show logged in RingCentral accout if logged in, else show login url.
 * @param glip 
 * @param msg 
 * @param aiResult 
 */
export async function rcLogin(g: Glip, msg: GlipMessage, aiResult) {
	glip = g;

	let rc = await getRc(msg.creatorId);
	let token = rc.rest.getToken();
	if (token) {
		await showLoggedInRc(glip, msg.groupId, msg.creatorId);
	} else {
		glip.sendMessage(msg.groupId, `Please log into RingCentral at \
[here](${rc.oauthUrl(config.RcApp.redirectUri, { state: msg.creatorId + ':' + msg.groupId, force: true })})`);
	}
}


/**
 * 
 * @param groupId 
 * @param callbackUrl 
 */
export async function loggedIn(state: string, callbackUrl: string) {
	let parts = state.split(':');
	let glipUserId = parts[0];
	let groupId = parts[1];
	let rc = await getRc(glipUserId);
	try {
		await rc.oauth(callbackUrl);
	} catch (e) {
		await glip.sendMessage(groupId, 'Login failed:' + e);
		return;
	}
	await showLoggedInRc(glip, groupId, glipUserId);
}

async function showLoggedInRc(glip: Glip, groupId: string, glipUserId: string) {
	let ext = await getRcExtension(glipUserId);
	glip.sendMessage(groupId, `@${glipUserId} The RingCentral account you logged in is ${ext.name}(${ext.extensionNumber}, ${ext.contact.email}).`);
}
export async function getRc(creatorId: string) {
	let rc = rcClients[creatorId];
	if (!rc) {
		rc = new RingCentral(config.RcApp);
		rcClients[creatorId] = rc;
		await rc.restoreToken(null, new RedisTokenStore('rc-token:glip-user:' + creatorId, redis)).catch(e => {
			//console.log('Fail to restore token from redis.' + e);
		});
	}
	return rc;
}

async function getRcExtension(glipUserId: string) {
	let ext = rcExtensions[glipUserId];
	if (!ext) {
		let rc = await getRc(glipUserId);
		ext = await rc.account().extension().get();
		rcExtensions[glipUserId] = ext;
	}
	return ext;
}