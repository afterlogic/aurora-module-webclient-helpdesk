<?php
/**
 * @copyright Copyright (c) 2017, Afterlogic Corp.
 * @license AGPL-3.0 or AfterLogic Software License
 *
 * This code is licensed under AGPLv3 license or AfterLogic Software License
 * if commercial version of the product was purchased.
 * For full statements of the licenses see LICENSE-AFTERLOGIC and LICENSE-AGPL3 files.
 */

namespace Aurora\Modules\HelpDeskWebclient;

/**
 * @package Modules
 */
class Module extends \Aurora\System\Module\AbstractWebclientModule
{
	public $oApiHelpDeskManager = null;
	
	public $oCoreDecorator = null;
	
	public function init() 
	{
		$this->oApiHelpDeskManager = $this->GetManager('main');

		$this->AddEntry('helpdesk', 'EntryHelpDesk');
		
		$this->oCoreDecorator = \Aurora\System\Api::GetModuleDecorator('Core');
		$this->oHelpDeskDecorator = \Aurora\System\Api::GetModuleDecorator('HelpDesk');
		
		$this->subscribeEvent('System::DetectTenant', array($this, 'onTenantDetect'));
	}
	
	public function EntryHelpDesk()
	{
		$oAuthenticatedAccount = $this->oHelpDeskDecorator->GetCurrentUser();

		$oApiIntegrator = \Aurora\System\Api::GetSystemManager('integrator');
		
//		$mHelpdeskLogin = $this->oHttp->GetQuery('helpdesk');
		$sTenantName = \Aurora\System\Api::getTenantName();
		$mHelpdeskIdTenant = $this->oCoreDecorator->GetTenantIdByName($sTenantName);
		
		if (!\is_int($mHelpdeskIdTenant))
		{
			\Aurora\System\Api::Location('./');
			return '';
		}

		$bDoId = false;
		$sThread = $this->oHttp->GetQuery('thread');
		$sThreadAction = $this->oHttp->GetQuery('action');
		if (0 < \strlen($sThread))
		{
			$iThreadID = $this->oApiHelpDeskManager->getThreadIdByHash($mHelpdeskIdTenant, $sThread);
			if (0 < $iThreadID)
			{
				$oApiIntegrator->setThreadIdFromRequest($iThreadID, $sThreadAction);
				$bDoId = true;
			}
		}

		$sActivateHash = $this->oHttp->GetQuery('activate');
		if (0 < \strlen($sActivateHash) && !$this->oHttp->HasQuery('forgot'))
		{
			$bRemove = true;
			$oUser = $this->oApiHelpDeskManager->getUserByActivateHash($mHelpdeskIdTenant, $sActivateHash);
			/* @var $oUser \CHelpdeskUser */
			if ($oUser)
			{
				if (!$oUser->Activated)
				{
					$oUser->Activated = true;
					$oUser->regenerateActivateHash();

					if ($this->oApiHelpDeskManager->updateUser($oUser))
					{
						$bRemove = false;
						$oApiIntegrator->setUserAsActivated($oUser);
					}
				}
			}

			if ($bRemove)
			{
				$oApiIntegrator->removeUserAsActivated();
			}
		}

	
		//TODO oApiCapabilityManager
//		if ($oAuthenticatedAccount && $this->oApiCapabilityManager->isHelpdeskSupported($oAuthenticatedAccount) && $oAuthenticatedAccount->IdTenant === $mHelpdeskIdTenant)
		if ($oAuthenticatedAccount && $oAuthenticatedAccount->IdTenant === $mHelpdeskIdTenant)
		{
			if (!$bDoId)
			{
				$oApiIntegrator->setThreadIdFromRequest(0);
			}

			$oApiIntegrator->skipMobileCheck();
			\Aurora\System\Api::Location('./');
			return '';
		}
		
		$oCoreClientModule = \Aurora\System\Api::GetModule('CoreWebclient');
		if ($oCoreClientModule instanceof \Aurora\System\Module\AbstractModule) {
			$sResult = \file_get_contents($oCoreClientModule->GetPath().'/templates/Index.html');
		}
		
		if (\is_string($sResult))
		{
			$oSettings =& \Aurora\System\Api::GetSettings();
			$sFrameOptions = $oSettings->GetConf('XFrameOptions', '');
			if (0 < \strlen($sFrameOptions)) {
				@\header('X-Frame-Options: '.$sFrameOptions);
			}
			
//			$sHelpdeskHash = $this->oHttp->GetQuery('helpdesk', '');

			$sResult = \strtr($sResult, array(
				'{{AppVersion}}' => AURORA_APP_VERSION,
				'{{IntegratorDir}}' =>  $oApiIntegrator->isRtl() ? 'rtl' : 'ltr',
				'{{IntegratorLinks}}' => $oApiIntegrator->buildHeadersLink('-helpdesk'),
				'{{IntegratorBody}}' => $oApiIntegrator->buildBody('-helpdesk')
			));
		}
		
		return $sResult;
	}
	
	/**
	 * Obtains list of module settings for authenticated user.
	 * 
	 * @return array
	 */
	public function GetSettings()
	{
		\Aurora\System\Api::checkUserRoleIsAtLeast(\EUserRole::Anonymous);
		
		return array(
			'AllowEmailNotifications' => '', //AppData.User ? !!AppData.User.AllowHelpdeskNotifications : false,
			'IsAgent' => '', //AppData.User ? !!AppData.User.IsHelpdeskAgent : false,
			'UserEmail' => '', //AppData.User ? Types.pString(AppData.User.Email) : '',
			'signature' => '', //ko.observable(AppData.User ? Types.pString(AppData.User.HelpdeskSignature) : ''),
			'useSignature' => '', //ko.observable(AppData.User ? !!AppData.User.HelpdeskSignatureEnable : false),
			'ActivatedEmail' => '',
			'AfterThreadsReceivingAction' => '', //Types.pString(AppData.HelpdeskThreadAction), // add, close
			'ClientDetailsUrl' => '', //Types.pString(AppData.HelpdeskIframeUrl),
			'ClientSiteName' => '', //Types.pString(AppData.HelpdeskSiteName), // todo
			'ForgotHash' => '', //Types.pString(AppData.HelpdeskForgotHash),
			'LoginLogoUrl' => '', //Types.pString(AppData.HelpdeskStyleImage),
			'SelectedThreadId' => 0, //Types.pInt(AppData.HelpdeskThreadId),
			'SocialEmail' => '', //Types.pString(AppData.SocialEmail),
			'SocialIsLoggedIn' => '', //!!AppData.SocialIsLoggedIn, // ???
			'ThreadsPerPage' => 10 // add to settings
		);
	}
	
	public function onTenantDetect($oParams, &$mResult)
	{
		if ($oParams && $oParams['URL'])
		{
			$aUrlData = \Sabre\Uri\parse($oParams['URL']);
			
			if ($aUrlData['query'])
			{
				$aParameters = \explode('&', $aUrlData['query']);
				
				if (!\is_array($aParameters))
				{
					$aParameters = array($aParameters);
				}
				
				$aParametersTemp = $aParameters;
				$aParameters = array();
				
				foreach ($aParametersTemp as &$aParameter) {
					$aParameterData = \explode('=', $aParameter);
					if (\is_array($aParameterData))
					{
						$aParameters[$aParameterData[0]] = $aParameterData[1];
					}
				}

				if (isset($aParameters['helpdesk']) && $this->oCoreDecorator->GetTenantIdByName($aParameters['helpdesk']))
				{
					$mResult = $aParameters['helpdesk'];
				}
			}
		}
	}
}
