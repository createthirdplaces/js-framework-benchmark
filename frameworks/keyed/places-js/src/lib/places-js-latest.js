/**
 * Class to define a data store load action through an API call.
 */
class ApiLoadAction{

  constructor(getRequestConfig) {
    this.getRequestConfig = getRequestConfig;
  }
 
	/**
   * @param params API request parameters
   * @param cacheKey
   * @param requestKey
   */
  async fetch(params, cacheKey, requestKey){

    const queryConfig = this.getRequestConfig(params);

    if(!queryConfig.headers){
      queryConfig.headers = {};
    }

    const response = await ApiLoadAction.getResponseData(
      queryConfig,
    );

    if(cacheKey && requestKey){
      if(queryConfig?.method !== "GET"){
        for(let i = 0; i< sessionStorage.length; i++){
          const key = sessionStorage.key(i);
          sessionStorage.setItem(key, JSON.stringify({}));
        }
      }
        
      const data = JSON.parse(sessionStorage.getItem(cacheKey));
      data[requestKey] = response;
      sessionStorage.setItem(cacheKey, JSON.stringify(data));

    }
    return response;
  }

  static async #getErrorData(response, url) {

    let message;

    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      message = await response.json();
    } else {
      if (response.status === 404) {
        message = `Endpoint ${url} not found`;
      } else {
        message = await response.text();
      }
    }

    return {
      status: response.status,
      errorMessage: message,
      endpoint: url,
    };
  }

  /**
   * Directly make an API request and return the data. Use this method if the API request needs
   * to be run as part of an event handler and no other components subscribe to the request.
   * Cache data will not be used or updated.
   *
   * @param {ApiRequestConfig} queryConfig Configuration of the API request.
   */
  static async getResponseData(queryConfig){

    let authData = null;

    const data = window.localStorage.getItem("authToken");
    if(data){
      authData = JSON.parse(data).access_token;
    }
    
    if (authData) {
      if(queryConfig.headers){
        queryConfig.headers["authToken"] = authData;
      } else {
        queryConfig.headers = {
          "authToken": authData
        };
      }
    }

    try {

      //The replace call is a workaround for an issue with url strings containing double quotes.
      const response = await fetch(queryConfig.url.replace(/"/g, ""), {
        method: queryConfig.method ?? "GET",
        headers: queryConfig.headers,
        body: queryConfig.body,
      });

      if (response.status !== 200) {
        return await this.#getErrorData(response,queryConfig.url)
      }

      const contentType = response.headers.get("content-type");
      if (contentType === "application/json") {
        return await response.json();
      }

      //Clear cache because there was a likely data update.
      if(queryConfig.method !== "GET"){
       for(let i = 0; i< sessionStorage.length; i++){
          const key = sessionStorage.key(i);
          sessionStorage.setItem(key, JSON.stringify({}));
        }
      }
      return { status: 200 };
    } catch (e) {
      return {errorMessage:e.message};
    }
  }
}

function freezeState(state){
  if(!state || JSON.stringify(state)==='{}'){
    return {};
  }
  for (let [key, value] of Object.entries(state)) {
    if (state.hasOwnProperty(key) && typeof value == "object") {
      freezeState(value);
    }
  }
  return Object.freeze(state);
}

class BaseDynamicComponent extends HTMLElement {

  #attachedEventsToShadowRoot = false;
  #componentIsRendering = false;
  #loadingFromStores = new Set();
  #loadingStarted = 0;
  #loadingIndicatorConfig;
  
  #templateData = null;
  #templateContainers = null;
  #subscribedStores = [];

	//Stores state for the component.
  componentStore = {};
  #templateLoaded = false;

  static computedProps = {};
  static templates = {};
  static templateSignals = {};
  static dynamicSignals = {};
  static prevState = {}; 
  static prevOrdering = {};
  static eventHandlers = {};

  static defineTemplate(templateFunc, templateName){

    let template = document.createElement("template");
    let templateStr = templateFunc();

    let signals = {};
    let dynamicSignals = {};

    BaseDynamicComponent.computedProps[templateName.toUpperCase()] = {};
   
    BaseDynamicComponent.eventHandlers[templateName.toUpperCase()]= templateFunc.setupEventHandlers;

    //TOOD: Optimize peformance. 
    const start = Date.now();
    let i = 0;
    while(true){
      const stateVarPos = templateStr.indexOf("{{");
      if(stateVarPos === -1){
        break;
      }
     
      const endPos = templateStr.indexOf("}}");
      const signalStr = templateStr.substring(stateVarPos+2, endPos);
      const data = signalStr.split("=");
      const attr = data[0];
      const fieldName = data[1];

      let newStr = "";
      newStr+=`data-signal-id-${i}`;

     
      const templateFuncType = typeof templateFunc[fieldName];
      if(templateFuncType === 'function'){
        BaseDynamicComponent.computedProps[templateName.toUpperCase()][fieldName] = templateFunc[fieldName];

      }
      
      const signal = (signalData,elementRoot,signalId)=>{

        let updated = signalData[fieldName]; 
        let element = elementRoot.querySelector(`[data-signal-id-${signalId}]`);
       
        //Set attribute on root node as the default case.
        if(!element){
          element=elementRoot;
        }

        if(updated === '') {
          element.removeAttribute(attr);
        }
        else {
          if(attr==="textContent"){
            element.textContent = updated;
          } else {
            element.setAttribute(attr,`${updated}`);
          }
        }

        //Remove attributes that are not dynamic.
        if(templateFuncType !== 'function'){
          element.removeAttribute(`data-signal-id-${signalId}`); 
          const attrName = `[data-signal-id-${signalId}]`
        }
     }

      templateStr = templateStr.substring(0,stateVarPos) +
        newStr + templateStr.substring(endPos+2);
      signals[i]=signal;
      if(templateFuncType === 'function'){
        dynamicSignals[i] = signal;
      }
      i++;
    }

    BaseDynamicComponent.templateSignals[templateName.toUpperCase()] = signals;
   BaseDynamicComponent.dynamicSignals[templateName.toUpperCase()] = dynamicSignals;


    template.innerHTML = templateStr;

    BaseDynamicComponent.templates[templateName.toUpperCase()] = template;
    BaseDynamicComponent.prevState[templateName.toUpperCase()]={};
    BaseDynamicComponent.prevOrdering[templateName.toUpperCase()]=[];
  }

	/**
	 * @param dataStoreSubscriptions - An array of data stores the component should
	 * subscribe to.
	 * indicator.
	 **/
  constructor(dataStoreSubscriptions = [], loadingIndicatorConfig) {
    super();

    if(loadingIndicatorConfig){
      this.#loadingIndicatorConfig = loadingIndicatorConfig;
    }

    //Performance optimization if component is not subscribed to data stores.
    if(dataStoreSubscriptions.length === 0) {
      this.updateData({});
      return;
    }
		
    // Make sure component is subscribed to data stores.
    this.#subscribedStores = dataStoreSubscriptions;
    for(let i=0;i <this.#subscribedStores.length;i++){
      this.#subscribedStores[i].dataStore.subscribeComponent(this);
    }

    this.updateFromSubscribedStores();
  }

  addClickEventListeners(eventListeners){
    this.clickEventListeners = eventListeners;
  }
	
  /**
	 * Shows custom loading indicator if it exists. This custom loading indicator
	 * replaces UI components and disables any user events.
	 **/
  lockComponent(dataStore){

    if(!this.#loadingFromStores.has(dataStore)){
      this.#loadingFromStores.add(dataStore);
    }

		// Save the timestamp for when the loading started.
    if(this.#loadingStarted === 0){
      this.#loadingStarted = Date.now();
    }

    if(this.#loadingIndicatorConfig){ 
      this.innerHTML = this.#loadingIndicatorConfig.generateLoadingIndicatorHtml();
    }
  }

  unlockComponent(dataStore) {
    this.#loadingFromStores.delete(dataStore);
  }

	/**
	 * Unsubscribe component when it is removed from the UI.
	 **/
  disconnectedCallback(){
    for(let i = 0; i < this.#subscribedStores.length; i++){
      this.#subscribedStores[i].dataStore.unsubscribeComponent(this);
    }
  }

  /**
	 * Update component with state data
	 **/
  updateData(storeUpdates) {
    if (storeUpdates) {
      this.#componentIsRendering = true;
      this.componentStore = {...this.componentStore,...freezeState(storeUpdates)};
      this.#generateAndSaveHTML(this.componentStore);
      this.#componentIsRendering = false;
    }
  }

  updateFromSubscribedStores() {

    let allSubscribedStoresHaveData = true;
    for(let i = 0; i < this.#subscribedStores.length; i++){
      allSubscribedStoresHaveData = 
				allSubscribedStoresHaveData &&
        (this.#subscribedStores[i].dataStore.hasLatestData());
    }

		// Make sure a component state is updated only when all the subscribed
		// stores have data 
    if(allSubscribedStoresHaveData){

      let dataToUpdate = {};
      for(let i =0; i < this.#subscribedStores.length; i++){

        const item = this.#subscribedStores[i];
        let storeData = item.dataStore.getStoreData();
        if(item.componentReducer){
          storeData = item.componentReducer(storeData);
        }

        if(item.fieldName) {
          dataToUpdate[item.fieldName] = storeData;
        } else {
          dataToUpdate = storeData;
        }
      }
      this.updateData(
        dataToUpdate,
      );
    }
  }

  #renderTemplates(data,content) {
 
    const templates= content.querySelectorAll("[data-template-name]");
    let domParser = new DOMParser();

    if(!this.#templateData){
      this.#templateData = [] 
      for(let i=0;i<templates.length;i++){
        let attrs = [];
        const attrNames = templates[i].getAttributeNames();
        const dataFieldName = templates[i].getAttribute("data-array");
        const dataTemplateName = templates[i].getAttribute("data-template-name");
        for(let j=0;j<attrNames.length;j++){
          const attrName = attrNames[j]; 
          const attrValue = templates[i].getAttribute(attrName);
          if(attrName.startsWith("data")||attrValue.startsWith("data")){
            if(attrName !== "data-template-name"){
              templates[i].removeAttribute(attrName);
            }
          }
          attrs.push({
            name:attrName,
            value:attrValue
          });
        }   
        this.#templateData.push({
          attributes:attrs,
          dataFieldName:dataFieldName,
          dataTemplateName: dataTemplateName
        });
      } 
    }
    
    for(let i = 0; i < templates.length;i++){
       
      const templateName = this.#templateData[i].dataTemplateName.toUpperCase();  
      const templateNode = BaseDynamicComponent.templates[templateName]; 
      const state = data[this.#templateData[i].dataFieldName] || []; 
      
      const attrs = this.#templateData[i].attributes; 
      let props = {};
      
      const nodes = []; 
      const fragment = document.createDocumentFragment();

      let replace = true; 
      const prevStateLen = Object.keys(BaseDynamicComponent.prevState[templateName]).length;
    
      const updatedOrdering = [];
      for(let num=0;num<state.length;num++){
        updatedOrdering.push(state[num].id);
      } 

      const prevIds = new Set(BaseDynamicComponent.prevOrdering[templateName]);
      const newIds = new Set(updatedOrdering);

      let removed = prevIds.difference(newIds);
      let added = newIds.difference(prevIds);

      if(added.size > 0 && prevIds.size > 0){
        
        let addFragment = null;

        for(let num = 0; num < updatedOrdering.length; num++){
          const updateData = updatedOrdering[num]; 
          if(added.has(updateData.id)){
          
            if(addFragment === null){
              addFragment = document.createDocumentFragment();
            }
            
            const rowProps = {...updateData}

            for(let j=0;j<attrs.length;j++){
              if(attrs[j].name !== "data-array"){
                if(attrs[j].value.startsWith("data")){
                  const itemKey = attrs[j].value.split('.')[1];
                  rowProps[attrs[j].name]= data[itemKey];
                }
              }
            }

            let addNode = templateNode.cloneNode(true);
            const signalsToRun = BaseDynamicComponent.templateSignals[templateName];
            Object.keys(signalsToRun).forEach((sNum)=>{ 
              signalsToRun[sNum](rowProps,addNode.content,sNum);
            })
           
            const eventHandlers = BaseDynamicComponent.eventHandlers[templateName];
            if(eventHandlers){
              eventHandlers(updatedNode.content.firstChild, rowProps);
            }

            addFragment.appendChild(updatedNode.content);
          }else {
            if(addFragment !== null){
              const curNode = this.getRootNode().getElementById(""+updateData.id); 
              curNode.parent.insertBefore(addFragment,curNode); 
              addFragment = null;
            }
          }
        }
        
        if(addFragment !== null){
          const lastId = updatedOrdering[updateOrdering.length-1].id
          const lastNode = this.getRootNode().getElementById(""+lastId.id);
          lastNode.parent.appendChild(addFragment);
        }
        replace = false;
      }
 
      if(removed.size > 0) {
        //All the nodes have been removed. 
        if(newIds.size === 0) {
          replace = true;
        }
        else {
          const self = this;
          removed.forEach((id)=>{ 
            const node = self.getRootNode().getElementById(""+id);
            node.parentNode.removeChild(node);

            const idx = BaseDynamicComponent.prevOrdering[templateName].findIndex((elem)=>elem === id);
            BaseDynamicComponent.prevOrdering[templateName].splice(idx,1); 
          });
          replace = false;
        }
      }
 
      if(updatedOrdering.length === BaseDynamicComponent.prevOrdering[templateName].length){
        let moveNodes = [];
        for(let num=0;num<updatedOrdering.length;num++){
          if(updatedOrdering[num] !== BaseDynamicComponent.prevOrdering[templateName][num]){
          
            let insertBefore = null;
            if (num < updatedOrdering.length -1){
             
              insertBefore = this.getRootNode().getElementById(
                ""+updatedOrdering[num+1]);
            }
            moveNodes.push({
              moveId:updatedOrdering[num],
              prevNode:insertBefore
            }); 
          }
        }
        
        if(moveNodes.length > 0){
          for(let mNum=moveNodes.length-1;mNum>=0;mNum--){
           
            const moveData = moveNodes[mNum];

            const nodeToMove = this.getRootNode().getElementById(
              moveData.moveId);
          
            if(moveData.prevNode !== null){
              moveData.prevNode.parentNode.insertBefore(nodeToMove,moveData.prevNode);
            } else {
              nodeToMove.parentNode.appendChild(nodeToMove);
            }
          }
        }
        BaseDynamicComponent.prevOrdering[templateName] = updatedOrdering; 

        replace = false;
      }else {
        replace = true;
      }
        
      for(let num=0;num<state.length;num++){
      
        const id = state[num].id;
        const itemState = state[num];        
        const rowProps = {...itemState}

        for(let j=0;j<attrs.length;j++){
          if(attrs[j].name !== "data-array"){
            if(attrs[j].value.startsWith("data")){
              const itemKey = attrs[j].value.split('.')[1];
              rowProps[attrs[j].name]= data[itemKey];
            }
          }
        }
        
        let equalState = true;
       
        const prevProps = BaseDynamicComponent.prevState[templateName][""+id] || {};
        
        //Calculate computed values.
        const computed = BaseDynamicComponent.computedProps[templateName];
        Object.keys(computed).forEach((computedKey)=>{
          rowProps[computedKey] = computed[computedKey](rowProps);
          equalState = equalState && rowProps[computedKey] === prevProps[computedKey];
        });
               
        Object.keys(itemState).forEach(propName=>{
          const propType = typeof rowProps[propName]; 
          if(propType === 'number' || propType === 'string'){
            equalState = equalState && rowProps[propName] === prevProps[propName];
          };
          if(propType === "object"){
            equalState = equalState && Object.is(rowProps[propName],prevProps[propName]);
          } 
        });
       
          let updatedNode;
          if(!replace){
            if(!equalState){
              const signalsToRun = BaseDynamicComponent.dynamicSignals[templateName];
       
              Object.keys(signalsToRun).forEach((sNum)=>{
                signalsToRun[sNum](
                  rowProps,
                  this.getRootNode().getElementById(""+id), 
                  sNum);

              });
              
              BaseDynamicComponent.prevState[templateName][id] = rowProps;
            } 
          }
          else {
            updatedNode = templateNode.cloneNode(true);
            const signalsToRun = BaseDynamicComponent.templateSignals[templateName];
            const computed = Object.keys(BaseDynamicComponent.computedProps[templateName]);
            Object.keys(signalsToRun).forEach((sNum)=>{ 
              signalsToRun[sNum](rowProps,updatedNode.content,sNum); 
            });
            const eventHandlers = BaseDynamicComponent.eventHandlers[templateName];
            if(eventHandlers){
              eventHandlers(updatedNode.content.firstChild, rowProps);
            }

            fragment.appendChild(updatedNode.content);
            BaseDynamicComponent.prevState[templateName][id] = rowProps;
        }
      }

      if(replace){
        BaseDynamicComponent.prevOrdering[templateName] = updatedOrdering;
        templates[i].replaceChildren(fragment);
      }
    }
    
     if(templates.length >= 0){
      this.#templateLoaded = true;
    }
  }
  
  #generateAndSaveHTML(data) {

    let start = Date.now();

    //Don't re-render static HTML if templates are being used.
    if(!this.#templateLoaded){
      const template = document.createElement("template");
      if(this.#loadingStarted > 0){
        const current = Date.now();
        const loadTime = current - this.#loadingStarted;

        this.#loadingStarted = 0;
        
        //Handle case where loading indicator is configured to stay visible for a
        //minimum amount of time.
        if(this.#loadingIndicatorConfig?.minTimeMs){
          const remainingTime = this.#loadingIndicatorConfig.minTimeMs - loadTime;

          const self = this;
          if(remainingTime > 0){
            setTimeout(()=>{
              template.innerHTML = this.render(data);
            },remainingTime);
          } else {
            template.innerHTML = this.render(data);
          }
        } else {
          template.innerHTML = this.render(data);
        }
      }
      else {
        template.innerHTML = this.render(data);
      }

      this.innerHTML = "";
      this.#renderTemplates(data,template.content);
      console.log(Date.now()-start);
      this.innerHTML = template.innerHTML;

      if(this.clickEventListeners){
        const selectors = Object.keys(this.clickEventListeners);
        if(selectors.length > 0) {
          selectors.forEach(selector=>{
            console.log(selector);
            const element = this.getRootNode().querySelector(selector);
            if(!element){
              console.error(`Invalid selector ${selector} for click event handler`);
            }
            else {
              element.addEventListener("click",(e)=>{
                e.preventDefault();
                this.clickEventListeners[selector]();
              });
            }
          });
        }
      }
    } else {
      this.#renderTemplates(data,this);
      console.log(Date.now()-start);
    }
  }
}

class BaseTemplateComponent extends HTMLElement {
  connectedCallback() {
    this.attachShadow({ mode: "open" });

    this.shadowRoot;
    const template = document.createElement("template");
    
    template.innerHTML = this.getTemplateStyle() + `<div></div>`;
    this.shadowRoot.appendChild(template.content.cloneNode(true));
    this.shadowRoot.querySelector("div").innerHTML = this.render(); 
  }
}

/**
 * Class to define a custom data store load action with direct control over any async calls that are made.
 * It is intended for use when additional processing needs to be done after an async call, or if a store needs
 * to combine data from multiple sources.
 */
class CustomLoadAction {
  constructor(loadFunction) {
    this.fetch = async (params) => {
      return await loadFunction(params);
    };
  }
}

class DataStore {

  static #storeCount = 0;

  #componentSubscriptions = [];
  #isLoading = false; 
  #loadAction;
  #requestStoreId;
  #storeData = null;

  constructor(loadAction) {
    this.#loadAction = loadAction;
    this.#componentSubscriptions = [];
    this.#requestStoreId = `store-${DataStore.#storeCount}`;
    
	sessionStorage.setItem(this.#requestStoreId, JSON.stringify({}));
    DataStore.#storeCount++;
  }

  /**
   * Returns data from the store.
   * @returns A JSON object representing an immutable copy of store data.
   */
  getStoreData() {
    return this.#storeData;
  }

  /**
   * @returns {boolean} false if the data in the store is null or undefined and is not in a loading state true otherwise.
   */
  hasLatestData() {
    return this.#storeData !== null && this.#storeData !== undefined  && !this.#isLoading;
  }

  /**
   * Update data in the store and trigger a render of components subscribed to the store.
   * @param storeUpdates Updated store data. Fields not specified in storeData will not be updated.
   */
  updateStoreData(storeUpdates){
    this.#storeData = {...this.#storeData,...freezeState(storeUpdates)};
    for(let i = 0; i < this.#componentSubscriptions.length; i++){
      this.#componentSubscriptions[i].updateFromSubscribedStores();
    }
  }

  getSubscribedComponents(){
    return this.#componentSubscriptions;
  }

  /**
   * Retrieves data from an external source.
   * @param params Parameters for the request.
   * @param dataStore Optional data store that will be subscribed to updates from this store.
   */
  async fetchData(params = {}, dataStore){

    // Do not make a data request if there is an active one in progress. The active one will push data to subscribed components.
    if(!this.#isLoading) {
      this.#isLoading = true;

      const requestConfig = this.#loadAction.getRequestConfig ? this.#loadAction.getRequestConfig(params) : {};

      let response = null;
      let requestKey = null;
      
      // Retrieve cached response if one exists.
			if(this.#requestStoreId || this.#requestStoreId.length > 0){
        requestKey = `${requestConfig.method ?? ''}_${requestConfig.url}_${JSON.stringify(requestConfig.body) ?? ''}`;
      
        const dataStr = sessionStorage.getItem(requestKey);
        if(dataStr){
          const data = JSON.parse(dataStr);

          if(!(Object.keys(data).length === 0) && requestData in data){
            response = data[requestData];
          }
        }
      }

      // Make an API call if a cached response does not exist.
      if(response === null) {
        //Replace component with loading indicator if one exists.
        for (let i = 0; i < this.#componentSubscriptions.length; i++) {
          this.#componentSubscriptions[i].lockComponent(this);
        }
        if (dataStore) {
          const dataStoreSubscribedComponents = dataStore.getSubscribedComponents();
          for (let i = 0; i < dataStoreSubscribedComponents.length; i++) {
            dataStoreSubscribedComponents[i].lockComponent(dataStore);
          }
        }
        response = await this.#loadAction.fetch(params, this.#requestStoreId,requestKey); 
      } 
      
	    this.#storeData = response;
      this.#isLoading = false;

      for(let i = 0; i < this.#componentSubscriptions.length; i++){
        this.#componentSubscriptions[i].unlockComponent(this);
        this.#componentSubscriptions[i].updateFromSubscribedStores();
      }

      if(dataStore){
        const dataStoreSubscribedComponents = dataStore.getSubscribedComponents();
        for(let i = 0; i < dataStoreSubscribedComponents.length; i++){
          dataStoreSubscribedComponents[i].unlockComponent(dataStore);
        }
        dataStore.updateStoreData(response);
      }
      return response;
    }
  }

  unsubscribeComponent(component){
    this.#componentSubscriptions.splice(this.#componentSubscriptions.indexOf(component), 1);
  }

  subscribeComponent(component){

    let i = 0;
    while(i < this.#componentSubscriptions.length){
      if(this.#componentSubscriptions[i] === component){
        this.#componentSubscriptions = this.#componentSubscriptions.splice(i, 1);
        break;
      }
      i++;
    }
    this.#componentSubscriptions.push(component);

    if(!this.hasLatestData()){
      this.fetchData();
    }
  }
}

export { ApiLoadAction, BaseDynamicComponent, BaseTemplateComponent, CustomLoadAction, DataStore };
