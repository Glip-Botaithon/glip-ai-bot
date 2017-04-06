import Subscription from 'ringcentral-ts/Subscription';
import Glip, { GlipMessage } from './Glip';
import { getRc } from './rc-oauth';
import redis from './redis';

export async function receiveSms(glip: Glip, msg: GlipMessage, aiResult) {
	let glipUserId = msg.creatorId;
	let groupId = msg.groupId;
	let key = groupKey(glipUserId);
	redis.sadd(key, groupId, (err, addCount) => {
		if (err) {
			glip.sendMessage(groupId, 'Enable sms notification failed:' + err);
		} else if (addCount < 1) {
			glip.sendMessage(groupId, 'Sms notification already enabled for this chat.');
		} else {
			glip.sendMessage(groupId, 'Future sms of your RingCentral account will be sent here.');
			checkSubcription(glipUserId, glip);
		}
	});
}

export async function disableReceiveSMS(glip: Glip, msg: GlipMessage, aiResult) {
	let glipUserId = msg.creatorId;
	let groupId = msg.groupId;
	let key = groupKey(glipUserId);
	redis.srem(key, groupId, (err, remCount) => {
		if (err) {
			glip.sendMessage(groupId, 'Remove failed:' + err);
		} else if (remCount < 1) {
			glip.sendMessage(groupId, 'This chat does not receive sms.');
		} else {
			glip.sendMessage(groupId, 'Your sms wont show in this chat anymore.');
			checkSubcription(glipUserId, glip);
		}
	});
}

async function checkSubcription(glipUserId: string, glip: Glip) {
	let sub = smsSubscriptions[glipUserId];
	if (!sub) {
		let rc = await getRc(glipUserId);
		sub = new SmsSubscriptionForGlip(rc.createSubscription(), glipUserId, glip);
		smsSubscriptions[glipUserId] = sub;
	}
	sub.checkSubscription(glipUserId);
}

let smsSubscriptions: { [glipUserId: string]: SmsSubscriptionForGlip } = {};

class SmsSubscriptionForGlip {
	// recipientGroups: string[] = [];
	// ownerGlipUserId: string;

	subscription: Subscription;
	glip: Glip;

	constructor(sub: Subscription, glipUserId: string, glip: Glip) {
		this.subscription = sub;
		this.glip = glip;
		let key = groupKey(glipUserId);
		sub.onMessage((evt) => {
			let smsEvt = evt.body;
			let smsNotification = `Sms received for ${smsEvt.to[0].name}(${smsEvt.to[0].phoneNumber}):\n\n${smsEvt.subject}`;
			redis.smembers(key, (err, groups) => {
				if (err) {
					console.error('Fail to get groups for sms notifications', err);
					return;
				}
				for (let groupId of groups) {
					glip.sendMessage(groupId, smsNotification);
				}
			});
		});
	}

	/**
	 * Subcribe if not exist
	 * Cancel the subscription if no groups
	 */
	async checkSubscription(glipUserId: string) {
		let subscriptionKey = 'sms-subscription:glip-user:' + glipUserId;
		let key = groupKey(glipUserId);
		redis.scard(key, async (err, count) => {
			if (err) {
				console.error('Get groups count error', err);
			} else if (count < 1) {
				await this.subscription.cancel();
				redis.del(subscriptionKey);
			} else if (!this.subscription.pubnub) {
				await this.subscription.subscribe(['/account/~/extension/~/message-store/instant?type=SMS']);
				redis.set(subscriptionKey, this.subscription.id, (err, res) => {
					if (err) {
						console.error('Fail to save subscription id to redis', err);
					}
				});
			}
		});
	}

}

function groupKey(glipUserId: string) {
	return 'groups-receive-sms:glip-user:' + glipUserId;
}

/* Sample sms notification:
 * { id: '2835129004',
  to:
   [ { phoneNumber: '+19167582086',
       name: 'Kevin Zeng',
       location: 'El Dorado Hills / Lincoln / Roseville / Walnut Grove / West Sacramento / Citrus Heights / Antelope / Folsom / Orangevale
/ Rancho Cordova / Rio Linda / Rocklin / Clarksburg / Fair Oaks / Loomis / Newcastle / North Highlands / North Sacramento / Mather / Granit
e Bay / Carmichael / Auburn, CA' } ],
  from: { phoneNumber: '+13213042353', location: 'Winter Park, FL' },
  type: 'SMS',
  creationTime: '2017-04-01T09:02:40.698Z',
  lastModifiedTime: '2017-04-01T09:02:40.698Z',
  readStatus: 'Unread',
  priority: 'Normal',
  attachments: [ { id: '2835129004', type: 'Text', contentType: 'text/plain' } ],
  direction: 'Inbound',
  availability: 'Alive',
  subject: 'test sms context',
  messageStatus: 'Received' }
 */

export function sendSms() {

}