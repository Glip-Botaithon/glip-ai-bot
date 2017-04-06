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
		}
	});
}

let smsSubscriptions: { [glipUserId: string]: SmsSubscriptionForGlip } = {};

class SmsSubscriptionForGlip {
	//recipientGroups: string[] = [];
	ownerGlipUserId: string;

	subscription: Subscription;
	glip: Glip;

	constructor(sub: Subscription, glipUserId: string, glip: Glip) {
		this.subscription = sub;
		this.glip = glip;
		this.ownerGlipUserId = glipUserId;
		sub.onMessage((evt) => {
			let smsEvt = evt.body;
			let smsNotification = `Sms received for ${smsEvt.to[0].name}(${smsEvt.to[0].phoneNumber}):\n\n${smsEvt.subject}`;
			for (let groupId of this.recipientGroups) {
				glip.sendMessage(groupId, smsNotification);
			}
		});
	}

	/**
	 * Return true if added, false if existed
	 * @param groupId 
	 */
	async addGroup(groupId: string, cb) {
		let key = this.groupKey();
		redis.sadd(key, groupId, (err, addedCount) => {
			if (err || addedCount != 1) {
				cb(err, addedCount);
				return;
			}
			redis.scard(key, (err, res) => {
				cb(err, 1);
				if (res == 1) {
					this.subscribe();
				}
			});
		});
	}

	async subscribe() {
		await this.subscription.subscribe(['/account/~/extension/~/message-store/instant?type=SMS']);
		redis.set('sms-subscription:glip-user:' + this.ownerGlipUserId, this.subscription.id);
	}

	removeGroup(groupId: string, cb) {
		redis.srem(this.groupKey(), (err, remCount) => {
			console.log('remove group', err, remCount)
		});
	}

	groupKey() {
		return 'groups-receive-sms:glip-user:' + this.ownerGlipUserId;
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